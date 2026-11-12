package com.velsedav.yoridokoro;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * Routes the Android system back button / back gesture to the web app instead of
 * letting BridgeActivity finish (which minimised the app on every back press).
 *
 * The web layer exposes window.__yoriHandleBack(), which closes the topmost
 * overlay (drawer, sheet, modal, menu) or navigates back in the in-app history.
 * It returns true when it consumed the event. Only when it returns false (we are
 * already on the home screen with nothing open) do we send the app to background.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge == null || bridge.getWebView() == null) {
                    moveTaskToBack(true);
                    return;
                }
                WebView webView = bridge.getWebView();
                webView.evaluateJavascript(
                    "(function(){try{return !!(window.__yoriHandleBack && window.__yoriHandleBack());}catch(e){return false;}})()",
                    value -> {
                        if (!"true".equals(value)) {
                            moveTaskToBack(true);
                        }
                    }
                );
            }
        });
    }
}
