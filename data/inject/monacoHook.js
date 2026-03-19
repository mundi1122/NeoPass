// monacoHook.js — Runs in MAIN world (injected via <script> tag from customPaste.js)
// PURPOSE: Direct access to window.monaco to insert pasted text into Monaco editor.
(function () {
    'use strict';

    if (window.__neoPassMonacoHookLoaded) return;
    window.__neoPassMonacoHookLoaded = true;

    var monacoLib = null;

    // ── 1. Find Monaco editor instance ──
    function getEditor() {
        if (!monacoLib && window.monaco) monacoLib = window.monaco;
        if (!monacoLib || !monacoLib.editor) return null;

        // getEditors() returns all ICodeEditor instances
        var editors = monacoLib.editor.getEditors ? monacoLib.editor.getEditors() : [];
        // Return the focused one, or the first one
        for (var i = 0; i < editors.length; i++) {
            if (editors[i].hasTextFocus && editors[i].hasTextFocus()) return editors[i];
        }
        return editors[0] || null;
    }

    // ── 2. Listen for paste commands from ISOLATED world ──
    window.addEventListener('message', function (event) {
        if (event.source !== window || !event.data) return;

        if (event.data.type === 'NEOPASS_MONACO_PASTE') {
            var text = event.data.text;
            if (!text) { window.postMessage({ type: 'NEOPASS_MONACO_PASTE_RESULT', success: false }, '*'); return; }

            var editor = getEditor();
            if (editor) {
                try {
                    var clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

                    if (event.data.mode === 'replace') {
                        // Replace entire content
                        var model = editor.getModel();
                        if (model) {
                            var fullRange = model.getFullModelRange();
                            editor.executeEdits('neopass-paste', [{
                                range: fullRange,
                                text: clean,
                                forceMoveMarkers: true
                            }]);
                        }
                    } else {
                        // Insert at cursor — trigger('keyboard', 'type') is the most reliable
                        editor.trigger('neopass-paste', 'type', { text: clean });
                    }

                    console.log('[MonacoHook] Pasted', clean.length, 'chars into Monaco editor');
                    window.postMessage({ type: 'NEOPASS_MONACO_PASTE_RESULT', success: true }, '*');
                    return;
                } catch (err) {
                    console.error('[MonacoHook] paste failed:', err.message);
                }
            }

            window.postMessage({ type: 'NEOPASS_MONACO_PASTE_RESULT', success: false }, '*');
        }

        if (event.data.type === 'NEOPASS_MONACO_GET_SELECTION') {
            var editor = getEditor();
            var text = '';
            if (editor) {
                try {
                    var sel = editor.getSelection();
                    var model = editor.getModel();
                    if (sel && model) {
                        text = model.getValueInRange(sel) || '';
                    }
                } catch (e) {
                    console.error('[MonacoHook] getSelection failed:', e.message);
                }
            }
            window.postMessage({ type: 'NEOPASS_EDITOR_SELECTION_RESULT', text: text }, '*');
        }

        if (event.data.type === 'NEOPASS_MONACO_PING') {
            window.postMessage({
                type: 'NEOPASS_MONACO_PONG',
                hasMonaco: !!(monacoLib || window.monaco),
                hasEditor: !!getEditor()
            }, '*');
        }
    });

    // ── 3. Init: poll for monaco lib ──
    function init() {
        if (window.monaco) {
            monacoLib = window.monaco;
            console.log('[MonacoHook] Monaco library found');
        } else {
            var tries = 0;
            var poll = setInterval(function () {
                tries++;
                if (window.monaco) {
                    monacoLib = window.monaco;
                    console.log('[MonacoHook] Monaco library found (poll attempt', tries + ')');
                    clearInterval(poll);
                } else if (tries > 120) {
                    clearInterval(poll);
                }
            }, 500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[MonacoHook] MAIN world script loaded');
})();
