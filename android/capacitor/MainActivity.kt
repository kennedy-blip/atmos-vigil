// ATMOS-VIGIL — Capacitor Android MainActivity template (Kotlin).
// Copied over the generated MainActivity by .github/workflows/build-and-bundle-apk.yml
// once `npx cap add android` has created the native project.
//
// Pattern (Capacitor 4+): local plugin classes are registered in onCreate BEFORE
// super.onCreate() is called — registerPlugin appends to the plugin builder that
// BridgeActivity's onCreate reads.
package com.atmosvigil.meteo

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(BarometerThermoPlugin::class.java)
        registerPlugin(AeroAcousticAnemometerPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun onDestroy() {
        try {
            super.onDestroy()
        } finally {
            // noop
        }
    }
}
