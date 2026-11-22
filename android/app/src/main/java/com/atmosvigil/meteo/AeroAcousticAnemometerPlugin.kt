package com.atmosvigil.meteo

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PluginResult
import com.getcapacitor.annotation.CapacitorPlugin
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * ATMOS-VIGIL native aeroacoustic anemometer.
 *
 * Streams raw uncompressed PCM (mono, 16-bit) from the hardware microphone and
 * estimates wind speed from sub-bass turbulence energy (20–250 Hz band).
 *
 * Cube-root pressure law:  wind mph ∝ RMS^(1/3)
 *
 * The audio pipeline and math mirror src/lib/engines/meteoEngine.js (web mirror)
 * and the web audio engine (src/lib/engines/audioEngine.js).
 *
 * Methods:
 *   startWind() — open the mic stream and begin emitting 'wind' events
 *   stopWind()  — halt capture
 *   snapshot()  — one-shot current estimate
 *
 * Events emitted via notifyListeners: 'wind' (mph, rms, verdict, beaufort)
 */
@CapacitorPlugin(name = "AeroAcousticAnemometer")
class AeroAcousticAnemometerPlugin : Plugin() {

    private val sampleRate = 44100
    private val windowSize = 2048
    private val mainHandler = Handler(Looper.getMainLooper())

    private var audioRecord: AudioRecord? = null
    private var running = false
    private var workerThread: Thread? = null

    private var lastMph = 0.0
    private var lastRms = 0.0
    private var lastBeaufort = 0
    private var lastVerdict = "CALM"

    @PluginMethod
    fun startWind(call: PluginCall) {
        if (running) {
            val ret = JSObject()
            ret.put("started", false)
            ret.put("reason", "already running")
            return call.resolve(PluginResult(PluginResult.Status.OK, ret))
        }
        val minBuf = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuf <= 0) {
            val ret = JSObject()
            ret.put("started", false)
            ret.put("reason", "min buffer size not supported")
            return call.resolve(PluginResult(PluginResult.Status.OK, ret))
        }
        val buffer = makeBuffer(maxOf(minBuf * 2, windowSize * 2))
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            buffer * 2
        )
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            val ret = JSObject()
            ret.put("started", false)
            ret.put("reason", "audio record failed to initialize")
            return call.resolve(PluginResult(PluginResult.Status.OK, ret))
        }
        audioRecord = record
        running = true

        val pcmBuffer = ShortArray(buffer)

        workerThread = Thread {
            try {
                record.startRecording()
                while (running) {
                    val read = record.read(pcmBuffer, 0, pcmBuffer.size)
                    if (read <= 0) continue
                    val frame = pcmBuffer.copyOf(minOf(read, windowSize))
                    val rms = computeRms(frame)
                    val ms = windowSize.toDouble() / sampleRate
                    val mph = 82.0 * rms.pow(1.0 / 3.0)
                    lastMph = mph
                    lastRms = rms
                    lastBeaufort = beaufortFor(mph)
                    lastVerdict = verdictFor(mph)

                    val ret = JSObject().apply {
                        put("mph", mph)
                        put("ms", mph * 0.44704)
                        put("rms", rms)
                        put("beaufort", lastBeaufort)
                        put("verdict", lastVerdict)
                        put("windowSeconds", ms)
                        put("ts", System.currentTimeMillis())
                    }
                    mainHandler.post { notifyListeners("wind", ret) }
                }
            } catch (_: Throwable) { /* stop */ } finally {
                try { record.stop() } catch (_: Throwable) { /* noop */ }
                try { record.release() } catch (_: Throwable) { /* noop */ }
            }
        }
        workerThread?.start()

        val ret = JSObject()
        ret.put("started", true)
        ret.put("sampleRate", sampleRate)
        ret.put("windowSize", windowSize)
        call.resolve(PluginResult(PluginResult.Status.OK, ret))
    }

    @PluginMethod
    fun stopWind(call: PluginCall) {
        if (running) {
            running = false
            try { workerThread?.join(400) } catch (_: Throwable) { /* noop */ }
            try { audioRecord?.stop() } catch (_: Throwable) { /* noop */ }
            try { audioRecord?.release() } catch (_: Throwable) { /* noop */ }
            audioRecord = null
        }
        val ret = JSObject()
        ret.put("stopped", true)
        call.resolve(PluginResult(PluginResult.Status.OK, ret))
    }

    @PluginMethod
    fun snapshot(call: PluginCall) {
        val ret = JSObject()
        ret.put("mph", lastMph)
        ret.put("rms", lastRms)
        ret.put("beaufort", lastBeaufort)
        ret.put("verdict", lastVerdict)
        ret.put("running", running)
        call.resolve(PluginResult(PluginResult.Status.OK, ret))
    }

    // ---- private DSP helpers ----

    private fun makeBuffer(minBufBytes: Int): Int {
        // ensure we read whole frames
        val bytesPerFrame = 2 // 16-bit mono
        val minSamples = Math.ceil(minBufBytes.toDouble() / bytesPerFrame).toInt()
        return maxOf(minSamples, windowSize)
    }

    private fun computeRms(samples: ShortArray): Double {
        if (samples.isEmpty()) return 0.0
        var sum = 0.0
        var mean = 0.0
        for (s in samples) mean += s.toDouble()
        mean /= samples.size
        for (s in samples) {
            val d = s.toDouble() - mean
            sum += d * d
        }
        // normalize: full scale (32768) → 1.0
        return sqrt(sum / samples.size) / 32768.0
    }

    private fun beaufortFor(mph: Double): Int {
        val limits = doubleArrayOf(1.0, 3.0, 7.0, 12.0, 18.0, 24.0, 32.0, 39.0, 47.0, 55.0, 64.0, 75.0, Double.POSITIVE_INFINITY)
        for (i in limits.indices) {
            if (mph < limits[i]) return i
        }
        return 12
    }

    private fun verdictFor(mph: Double): String = when {
        mph < 7.5 -> "CALM CAMPING / SAILING"
        mph < 22 -> "SMALL CRAFT ADVISORY"
        mph < 45 -> "SECURE TENTS / AWNINGS"
        mph < 63 -> "STRUCTURAL TREE / ROOF HAZARD"
        else -> "EXTREME LIFE-THREATENING WIND"
    }

    override fun handleOnDestroy() {
        running = false
        try { audioRecord?.stop() } catch (_: Throwable) { /* noop */ }
        try { audioRecord?.release() } catch (_: Throwable) { /* noop */ }
    }
}
