/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The app's own few words (tray, text field menu), in the languages Endcord speaks. Endcord's screens have their own
// translations (src/utils/i18n); these are for what the main process shows before or outside Discord's page

import { app } from "electron";

const en = {
    show: "Open Endcord",
    closeToTray: "Keep running in the tray when closed",
    startWithSystem: "Start with Windows",
    startAtLogin: "Start when you sign in",
    quit: "Quit Endcord",
    mentions: (n: number) => n === 1 ? "1 unread mention" : `${n} unread mentions`,
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select all",
    addToDictionary: "Add to dictionary",
    copyLink: "Copy link",
};

type Strings = typeof en;

const tr: Strings = {
    show: "Endcord'u aç",
    closeToTray: "Kapatınca tepside çalışmaya devam et",
    startWithSystem: "Windows ile başlat",
    startAtLogin: "Oturum açınca başlat",
    quit: "Endcord'dan çık",
    mentions: n => `${n} okunmamış bahsetme`,
    cut: "Kes",
    copy: "Kopyala",
    paste: "Yapıştır",
    selectAll: "Tümünü seç",
    addToDictionary: "Sözlüğe ekle",
    copyLink: "Bağlantıyı kopyala",
};

const es: Strings = {
    show: "Abrir Endcord",
    closeToTray: "Seguir en la bandeja al cerrar",
    startWithSystem: "Iniciar con Windows",
    startAtLogin: "Iniciar al iniciar sesión",
    quit: "Salir de Endcord",
    mentions: n => n === 1 ? "1 mención sin leer" : `${n} menciones sin leer`,
    cut: "Cortar",
    copy: "Copiar",
    paste: "Pegar",
    selectAll: "Seleccionar todo",
    addToDictionary: "Añadir al diccionario",
    copyLink: "Copiar enlace",
};

const fr: Strings = {
    show: "Ouvrir Endcord",
    closeToTray: "Rester dans la zone de notification à la fermeture",
    startWithSystem: "Lancer avec Windows",
    startAtLogin: "Lancer à l'ouverture de session",
    quit: "Quitter Endcord",
    mentions: n => n === 1 ? "1 mention non lue" : `${n} mentions non lues`,
    cut: "Couper",
    copy: "Copier",
    paste: "Coller",
    selectAll: "Tout sélectionner",
    addToDictionary: "Ajouter au dictionnaire",
    copyLink: "Copier le lien",
};

const ru: Strings = {
    show: "Открыть Endcord",
    closeToTray: "Оставаться в трее при закрытии",
    startWithSystem: "Запускать вместе с Windows",
    startAtLogin: "Запускать при входе в систему",
    quit: "Выйти из Endcord",
    mentions: n => `Непрочитанных упоминаний: ${n}`,
    cut: "Вырезать",
    copy: "Копировать",
    paste: "Вставить",
    selectAll: "Выделить всё",
    addToDictionary: "Добавить в словарь",
    copyLink: "Копировать ссылку",
};

const all: Record<string, Strings> = { en, tr, es, fr, ru };

/** The words in the system's language. Only after the app is ready, when Electron knows it */
export function strings(): Strings {
    return all[app.getLocale().slice(0, 2).toLowerCase()] ?? en;
}
