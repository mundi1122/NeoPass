// aceHook.js — Runs in MAIN world (injected via <script> tag from customPaste.js)
// PURPOSE: Direct access to window.ace to insert pasted text into ACE editor.
// Clipboard is read by ISOLATED world and sent here via postMessage.
(function () {
    'use strict';

    if (window.__neoPassAceHookLoaded) return;
    window.__neoPassAceHookLoaded = true;

    let aceEditor = null;
    let aceLib = null;

    const EDITOR_SELECTORS = [
        '.ace_editor',
        'div[aria-labelledby="editor-answer"]',
        '#editor',
        '[class*="ace_editor"]'
    ];

    // ── 1. Prevent site from blocking Ctrl+V/C keydown and paste/copy events ──
    const _origStop = Event.prototype.stopImmediatePropagation;
    Event.prototype.stopImmediatePropagation = function () {
        if (this.type === 'paste' || this.type === 'copy') return;
        if (this.type === 'keydown' && (this.ctrlKey || this.metaKey)) {
            var k = this.key;
            if (k === 'v' || k === 'V' || k === 'c' || k === 'C') return;
        }
        return _origStop.call(this);
    };

    // ── 2. Block site's paste/copy/cut listeners on ACE editor elements ──
    const _origAEL = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (type === 'paste' || type === 'copy' || type === 'cut') {
            if (this && this.classList && (
                this.classList.contains('ace_editor') ||
                this.classList.contains('ace_text-input') ||
                this.classList.contains('ace_content') ||
                this.classList.contains('ace_layer')
            )) {
                return; // silently drop
            }
        }
        return _origAEL.call(this, type, listener, options);
    };

    // ── 3. Find ACE editor instance ──
    function getEditor(el) {
        if (!el) return null;
        if (el.env && el.env.editor) return el.env.editor;
        if (el.__ace_editor__) return el.__ace_editor__;
        if (aceLib) { try { return aceLib.edit(el); } catch (_) {} }
        return null;
    }

    function findEditor() {
        for (var i = 0; i < EDITOR_SELECTORS.length; i++) {
            var els = document.querySelectorAll(EDITOR_SELECTORS[i]);
            for (var j = 0; j < els.length; j++) {
                var ed = getEditor(els[j]);
                if (ed) return ed;
            }
        }
        return null;
    }

    function ensureEditor() {
        if (!aceLib && window.ace) aceLib = window.ace;
        if (!aceEditor) aceEditor = findEditor();
        return aceEditor;
    }

    // ── 4. Listen for paste commands from ISOLATED world ──
    window.addEventListener('message', function (event) {
        if (event.source !== window || !event.data) return;

        if (event.data.type === 'NEOPASS_ACE_PASTE') {
            var text = event.data.text;
            if (!text) { window.postMessage({ type: 'NEOPASS_ACE_PASTE_RESULT', success: false }, '*'); return; }

            var editor = ensureEditor();
            if (editor) {
                try {
                    var clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    if (event.data.mode === 'replace') {
                        editor.setValue(clean, 1);
                    } else {
                        editor.insert(clean);
                    }
                    console.log('[AceHook] Pasted', clean.length, 'chars into ACE editor');
                    window.postMessage({ type: 'NEOPASS_ACE_PASTE_RESULT', success: true }, '*');
                    return;
                } catch (err) {
                    console.error('[AceHook] insert failed:', err.message);
                }
            }
            window.postMessage({ type: 'NEOPASS_ACE_PASTE_RESULT', success: false }, '*');
        }

        if (event.data.type === 'NEOPASS_ACE_GET_SELECTION') {
            var editor = ensureEditor();
            var text = '';
            if (editor) {
                try {
                    text = editor.getSelectedText() || '';
                } catch (e) {
                    console.error('[AceHook] getSelectedText failed:', e.message);
                }
            }
            window.postMessage({ type: 'NEOPASS_EDITOR_SELECTION_RESULT', text: text }, '*');
        }

        if (event.data.type === 'NEOPASS_ACE_PING') {
            window.postMessage({
                type: 'NEOPASS_ACE_PONG',
                hasAce: !!(aceLib || window.ace),
                hasEditor: !!ensureEditor()
            }, '*');
        }
    });

    // ── 5. Init: find ACE lib + editor, poll if not ready yet ──
    function init() {
        if (window.ace) {
            aceLib = window.ace;
            var _origEdit = aceLib.edit;
            aceLib.edit = function () {
                var ed = _origEdit.apply(this, arguments);
                if (ed && !aceEditor) { aceEditor = ed; console.log('[AceHook] Editor captured'); }
                return ed;
            };
        }
        ensureEditor();
        if (!aceEditor) {
            var tries = 0;
            var poll = setInterval(function () {
                tries++;
                if (!aceLib && window.ace) aceLib = window.ace;
                if (ensureEditor() || tries > 120) clearInterval(poll);
            }, 500);
        }
        new MutationObserver(function () { if (!aceEditor) ensureEditor(); })
            .observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[AceHook] MAIN world script loaded');
})();
