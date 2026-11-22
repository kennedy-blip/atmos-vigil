package com.atmosvigil.meteo

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PluginResult
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * ATMOS-VIGIL native barometer & thermometer.
 *
 * Reads hardware MEMS sensors:
 *   - Sensor.TYPE_PRESSURE            (hPa)
 *   - Sensor.TYPE_AMBIENT_TEMPERATURE (°C)
 *   - Sensor.TYPE_RELATIVE_HUMIDITY   (%RH)
 *
 * Methods:
 *   startBarometer() — register all three listeners
 *   stopBarometer()  — unregister
 *   snapshot()       — one-shot current values (hpa/hum)
 *
 * Events emitted via notifyListeners:
 *   'pressure', 'temperature', 'humidity'
 */
@CapacitorPlugin(name = "BarometerThermo")
class BarometerThermoPlugin : Plugin(), SensorEventListener {

    private var sensorManager: SensorManager? = null
    private var pressureSensor: Sensor? = null
    private var temperatureSensor: Sensor? = null
    private var humiditySensor: Sensor? = null

    private var lastPressureHpa = 1013.25
    private var lastTemperatureC = 0.0
    private var lastHumidityPct = 0.0
    private var running = false

    private val mainHandler = Handler(Looper.getMainLooper())

    @PluginMethod
    fun startBarometer(call: PluginCall) {
        try {
            val context = context ?: return call.reject("Context unavailable")
            sensorManager = context.getSystemService(android.content.Context.SENSOR_SERVICE) as SensorManager
            pressureSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_PRESSURE)
            temperatureSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_AMBIENT_TEMPERATURE)
            humiditySensor = sensorManager?.getDefaultSensor(Sensor.TYPE_RELATIVE_HUMIDITY)

            if (pressureSensor == null && temperatureSensor == null && humiditySensor == null) {
                val ret = JSObject()
                ret.put("available", false)
                ret.put("reason", "No barometer, temperature or humidity sensor found on this device")
                return call.resolve(PluginResult(PluginResult.Status.OK, ret))
            }

            pressureSensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
            temperatureSensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
            humiditySensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
            running = true

            val ret = JSObject()
            ret.put("available", true)
            ret.put("pressureAvailable", pressureSensor != null)
            ret.put("temperatureAvailable", temperatureSensor != null)
            ret.put("humidityAvailable", humiditySensor != null)
            call.resolve(PluginResult(PluginResult.Status.OK, ret))
        } catch (t: Throwable) {
            call.reject("Failed to start barometer listeners", t)
        }
    }

    @PluginMethod
    fun stopBarometer(call: PluginCall) {
        try {
            sensorManager?.unregisterListener(this)
        } catch (_: Throwable) { /* noop */ }
        running = false
        val ret = JSObject()
        ret.put("stopped", true)
        call.resolve(PluginResult(PluginResult.Status.OK, ret))
    }

    @PluginMethod
    fun snapshot(call: PluginCall) {
        val ret = JSObject()
        ret.put("pressureHpa", lastPressureHpa)
        ret.put("pressureInHg", lastPressureHpa / 33.8639)
        ret.put("temperatureC", lastTemperatureC)
        ret.put("humidityPct", lastHumidityPct)
        ret.put("running", running)
        call.resolve(PluginResult(PluginResult.Status.OK, ret))
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_PRESSURE && event.values.isNotEmpty()) {
            lastPressureHpa = event.values[0]
            val ret = JSObject().apply {
                put("pressureHpa", lastPressureHpa)
                put("pressureInHg", lastPressureHpa / 33.8639)
                put("temperatureC", lastTemperatureC)
                put("humidityPct", lastHumidityPct)
                put("ts", System.currentTimeMillis())
            }
            mainHandler.post { notifyListeners("pressure", ret) }
        } else if (event.sensor.type == Sensor.TYPE_AMBIENT_TEMPERATURE && event.values.isNotEmpty()) {
            lastTemperatureC = event.values[0]
            val ret = JSObject().apply {
                put("temperatureC", lastTemperatureC)
                put("pressureHpa", lastPressureHpa)
                put("humidityPct", lastHumidityPct)
                put("ts", System.currentTimeMillis())
            }
            mainHandler.post { notifyListeners("temperature", ret) }
        } else if (event.sensor.type == Sensor.TYPE_RELATIVE_HUMIDITY && event.values.isNotEmpty()) {
            lastHumidityPct = event.values[0]
            val ret = JSObject().apply {
                put("humidityPct", lastHumidityPct)
                put("pressureHpa", lastPressureHpa)
                put("temperatureC", lastTemperatureC)
                put("ts", System.currentTimeMillis())
            }
            mainHandler.post { notifyListeners("humidity", ret) }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) { /* noop */ }

    override fun handleOnDestroy() {
        try { sensorManager?.unregisterListener(this) } catch (_: Throwable) { /* noop */ }
        running = false
    }
}
