/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The screen share picker. A browser would show its own; Electron leaves it to the app. Plain DOM in a closed shadow
// root, so Discord's styles and Endcord's themes can't reach it and it costs nothing until a share starts

import type { PickedSource, ShareSource } from "./ipc";

const STRINGS = {
    en: { title: "Share your screen", screens: "Screens", windows: "Windows", audio: "Share sound too", audioHint: "Everything the computer plays is shared, except Endcord's own sound, so the call doesn't hear itself", audioHintAll: "Everything the computer plays is shared, voice chat included", cancel: "Cancel", share: "Share", none: "Nothing to share was found" },
    tr: { title: "Ekranını paylaş", screens: "Ekranlar", windows: "Pencereler", audio: "Sesi de paylaş", audioHint: "Bilgisayarda çalan her ses paylaşılır, Endcord'un kendi sesi hariç: sohbet kendini duymaz", audioHintAll: "Bilgisayarda çalan her ses paylaşılır, sesli sohbet de dahil", cancel: "Vazgeç", share: "Paylaş", none: "Paylaşılacak bir şey bulunamadı" },
};

const CSS = `
:host { all: initial; }
.backdrop {
    position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
    background: rgb(6 10 20 / 72%); font: 14px/1.4 "Barlow", "Bahnschrift", "Segoe UI", system-ui, sans-serif; color: #f3f6fb;
}
.dialog {
    width: min(760px, calc(100vw - 32px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column;
    background: #162137; border: 1px solid #253452; border-radius: 12px; box-shadow: 0 24px 64px rgb(0 0 0 / 45%);
}
h1 { margin: 0; padding: 20px 24px 4px; font-size: 20px; font-weight: 600; letter-spacing: 0.01em; }
.body { overflow-y: auto; padding: 8px 24px 16px; }
h2 { margin: 16px 0 8px; font-size: 13px; font-weight: 600; color: #b3bfd4; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.source {
    display: flex; flex-direction: column; gap: 6px; padding: 6px; margin: 0; text-align: left; cursor: pointer;
    background: #10182a; border: 2px solid #253452; border-radius: 8px; color: inherit; font: inherit;
}
.source:hover { border-color: #33456a; }
.source[aria-pressed="true"] { border-color: #5288f0; background: #1d2b46; }
.source:focus-visible { outline: 2px solid #9ccbff; outline-offset: 2px; }
.source img { width: 100%; aspect-ratio: 16 / 9; object-fit: contain; background: #0b1120; border-radius: 4px; }
.source span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; }
.empty { padding: 24px 0; color: #b3bfd4; }
.footer { display: flex; align-items: center; gap: 12px; padding: 14px 24px; border-top: 1px solid #253452; }
label { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
label input { margin: 3px 0 0; accent-color: #3d74e0; }
label small { display: block; color: #b3bfd4; font-size: 12px; }
.spacer { flex: 1; }
button.action {
    min-width: 96px; padding: 8px 16px; border-radius: 8px; border: 1px solid #33456a; cursor: pointer;
    background: transparent; color: #f3f6fb; font: inherit; font-weight: 600;
}
button.action:focus-visible { outline: 2px solid #9ccbff; outline-offset: 2px; }
button.primary { background: #3d74e0; border-color: #3d74e0; }
button.primary:hover { background: #5288f0; }
button.primary:disabled { opacity: 0.5; cursor: default; }
`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
    const node: HTMLElementTagNameMap[K] = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
}

/** The open picker's keys. Discord's page handles Enter itself and cancels it, so a listener added later never gets it */
let keyHandler: ((event: KeyboardEvent) => boolean) | null = null;

/**
 * Listens for the picker's keys before anything of Discord's: the preload runs before the page, and listeners on one
 * target run in the order they were added. Costs one check per key press while no picker is open
 */
export function listenForPickerKeys() {
    window.addEventListener("keydown", event => {
        if (!keyHandler?.(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
}

/**
 * Shows the picker over Discord and resolves with what was picked, or null when it was closed. ownSoundLeftOut: Windows
 * leaves this app's sound out of the shared sound (see LOOPBACK in desktop/src/share.ts)
 */
export function showSharePicker(sources: ShareSource[], canShareAudio: boolean, ownSoundLeftOut: boolean) {
    const text = navigator.language.toLowerCase().startsWith("tr") ? STRINGS.tr : STRINGS.en;

    return new Promise<PickedSource | null>(resolve => {
        const host = document.createElement("endcord-share-picker");
        const root = host.attachShadow({ mode: "closed" });
        let selected: string | null = sources.find(s => s.screen)?.id ?? sources[0]?.id ?? null;

        const finish = (picked: PickedSource | null) => {
            keyHandler = null;
            host.remove();
            resolve(picked);
        };
        const share = () => selected && finish({ id: selected, audio: canShareAudio && audio.checked });

        const shareButton = element("button", { className: "action primary", type: "button", textContent: text.share, disabled: !selected });
        shareButton.addEventListener("click", share);
        const cancelButton = element("button", { className: "action", type: "button", textContent: text.cancel });
        cancelButton.addEventListener("click", () => finish(null));

        const cards = new Map<string, HTMLButtonElement>();
        const select = (id: string) => {
            selected = id;
            for (const [cardId, card] of cards) card.setAttribute("aria-pressed", String(cardId === id));
            shareButton.disabled = false;
        };
        const section = (title: string, list: ShareSource[]) => {
            if (!list.length) return [];
            const grid = element("div", { className: "grid" });
            for (const source of list) {
                const card = element("button", { className: "source", type: "button", title: source.name },
                    element("img", { src: source.thumbnail, alt: "" }),
                    element("span", { textContent: source.name }));
                card.setAttribute("aria-pressed", String(source.id === selected));
                // A click from the keyboard (Enter or Space on the focused card, detail 0) shares it right away: the page's
                // own key handlers can take Enter before the listener below sees it, but not the button's own click
                card.addEventListener("click", event => {
                    select(source.id);
                    if (event.detail === 0) share();
                });
                card.addEventListener("dblclick", () => {
                    select(source.id);
                    share();
                });
                cards.set(source.id, card);
                grid.append(card);
            }
            return [element("h2", { textContent: title }), grid];
        };

        const audio = element("input", { type: "checkbox" });
        const footer = element("div", { className: "footer" });
        if (canShareAudio) footer.append(element("label", {}, audio, element("span", {}, text.audio, element("small", { textContent: ownSoundLeftOut ? text.audioHint : text.audioHintAll }))));
        footer.append(element("div", { className: "spacer" }), cancelButton, shareButton);

        const body = element("div", { className: "body" },
            ...section(text.screens, sources.filter(s => s.screen)),
            ...section(text.windows, sources.filter(s => !s.screen)));
        if (!sources.length) body.append(element("div", { className: "empty", textContent: text.none }));

        const dialog = element("div", { className: "dialog" }, element("h1", { id: "title", textContent: text.title }), body, footer);
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", "title");
        const backdrop = element("div", { className: "backdrop" }, dialog);
        backdrop.addEventListener("mousedown", event => {
            if (event.target === backdrop) finish(null);
        });

        // Escape closes; Enter shares, or cancels on the cancel button
        keyHandler = event => {
            if (event.key === "Escape") finish(null);
            else if (event.key === "Enter") root.activeElement === cancelButton ? finish(null) : share();
            else return false;
            return true;
        };

        root.append(element("style", { textContent: CSS }), backdrop);
        document.documentElement.append(host);
        (selected ? cards.get(selected) : cancelButton)?.focus();
    });
}
