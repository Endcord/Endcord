/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type * as t from "@endcord/discord-types";
import { _resolveReady, filters, findByCodeLazy, findByPropsLazy, findLazy, mapMangledModuleLazy, waitFor } from "@webpack";
import type * as TSPattern from "ts-pattern";

export let FluxDispatcher: t.FluxDispatcher;
waitFor(["dispatch", "subscribe"], m => {
    FluxDispatcher = m;
    // Importing this directly causes all webpack commons to be imported, which can easily cause circular dependencies.
    // For this reason, use a non import access here.
    Endcord.Api.PluginManager.subscribeAllPluginsFluxEvents(m);

    const cb = () => {
        m.unsubscribe("CONNECTION_OPEN", cb);
        _resolveReady();
    };
    m.subscribe("CONNECTION_OPEN", cb);
});

export let ComponentDispatch: any;
waitFor(["dispatchToLastSubscribed"], m => ComponentDispatch = m);

export const Constants: t.Constants = mapMangledModuleLazy('ME:"/users/@me"', {
    Endpoints: filters.byProps("USER", "ME"),
    UserFlags: filters.byProps("STAFF", "SPAMMER"),
    FriendsSections: m => m.PENDING === "PENDING" && m.ADD_FRIEND
});

export const RestAPI: t.RestAPI = findLazy(m => typeof m === "object" && m.del && m.put);
export const moment: typeof import("moment") = findByPropsLazy("parseTwoDigitYear");

export const { match, P }: { match: typeof TSPattern["match"], P: typeof TSPattern["P"]; } = mapMangledModuleLazy("@ts-pattern/matcher", {
    match: filters.byCode("return new"),
    P: filters.byProps("when")
});

export const lodash: typeof import("lodash") = findByPropsLazy("debounce", "cloneDeep");

export const i18n = mapMangledModuleLazy(['defaultLocale:"en-US"', /initialLocale:\i/], {
    t: m => m?.[Symbol.toStringTag] === "IntlMessagesProxy",
    intl: m => m != null && Object.getPrototypeOf(m)?.withFormatters != null
}, true);

export let SnowflakeUtils: t.SnowflakeUtils;
waitFor(["fromTimestamp", "extractTimestamp"], m => SnowflakeUtils = m);

export let Parser: t.Parser;
waitFor("parseTopic", m => Parser = m);
export let Alerts: t.Alerts;
waitFor(["show", "close"], m => Alerts = m);

const ToastType = {
    MESSAGE: "message",
    SUCCESS: "success",
    FAILURE: "failure",
    CUSTOM: "custom",
    CLIP: "clip",
    LINK: "link",
    FORWARD: "forward",
    BOOKMARK: "bookmark",
    CLOCK: "clock"
};

const ToastPosition = {
    TOP: 0,
    BOTTOM: 1
};

export interface ToastData {
    message: string,
    id: string,
    /**
     * Toasts.Type
     */
    type: string,
    options?: ToastOptions;
}

export interface ToastOptions {
    /**
     * Toasts.Position
     */
    position?: number;
    component?: React.ReactNode,
    duration?: number;
}

interface ToastsExports {
    showToast: (data: ToastData) => void;
    popToast(): void;
}

const ToastsExports = mapMangledModuleLazy(".currentToastMap.has(", {
    showToast: filters.byCode(".currentToastMap.has("),
    popToast: filters.byCode(".delete(")
});

export function createToast(message: string, type: string, options?: ToastOptions): ToastData {
    return {
        message,
        content: message,
        id: Toasts.genId(),
        type,
        options: {
            ...options,
            component: options?.component ?? message
        }
    } as any;
}

/**
 * Translates toast texts into the user's language. @utils/i18n fills this in; it is a hook rather than an
 * import because importing i18n here would pull settings into the webpack commons and create a cycle.
 */
export const toastTranslator = { translate: (text: string) => text };

const TypeToVariant: Record<string, string> = {
    [ToastType.SUCCESS]: "success",
    [ToastType.FAILURE]: "critical",
};

/**
 * Discord's toasts now take `{ text, variant, position, duration }` and render nothing for the older
 * `{ message, type, options }` shape that plugins use. The old fields are kept so older Discord builds still work.
 */
function toDiscordToast(toast: any) {
    if (!toast || typeof toast !== "object" || typeof toast.text === "string" || toast.__dangerouslyRenderContent) return toast;

    const { message, type, options } = toast;
    const converted: any = { ...toast, text: message, variant: TypeToVariant[type] ?? "default" };
    if (options?.duration != null) converted.duration = options.duration;
    if (options?.position != null) converted.position = options.position === ToastPosition.BOTTOM ? "bottom" : "top";

    const { component } = options ?? {};
    if (component != null && typeof component !== "string") converted.__dangerouslyRenderContent = () => component;

    return converted;
}

function showTranslatedToast(toast: any) {
    if (toast && typeof toast.message === "string") {
        const original = toast.message;
        const message = toastTranslator.translate(original);
        if (message !== original) {
            toast = { ...toast, message, content: toast.content === original ? message : toast.content };
            if (toast.options?.component === original) toast.options = { ...toast.options, component: message };
        }
    } else if (toast && typeof toast.text === "string") {
        toast = { ...toast, text: toastTranslator.translate(toast.text) };
    }
    return ToastsExports.showToast(toDiscordToast(toast));
}

export const Toasts = {
    Type: ToastType,
    Position: ToastPosition,
    genId: () => (Math.random() || Math.random()).toString(36).slice(2),

    show: showTranslatedToast,
    pop: ToastsExports.popToast,
    create: createToast,
};

/** Toast variants used by plugins written for other client mods, mapped to Discord's toast types. */
const VariantToType: Record<string, string> = {
    success: ToastType.SUCCESS,
    positive: ToastType.SUCCESS,
    critical: ToastType.FAILURE,
    danger: ToastType.FAILURE,
    error: ToastType.FAILURE,
    link: ToastType.LINK,
};

/**
 * Show a simple toast. If you need more options, use Toasts.show manually.
 * Also accepts `{ text, variant }`, the form many community plugins use.
 */
export function showToast(message: string | { text: string; variant?: string; }, type = ToastType.MESSAGE, options?: ToastOptions) {
    if (typeof message === "object" && message !== null) {
        type = VariantToType[message.variant ?? ""] ?? ToastType.MESSAGE;
        message = String(message.text);
    }
    Toasts.show(Toasts.create(message, type, options));
}

export const UserUtils = {
    getUser: findByCodeLazy(".USER(")
};

export const UploadManager = findByPropsLazy("clearAll", "addFile");
export const UploadHandler = {
    promptToUpload: findByCodeLazy("Unexpected mismatch between files and file metadata") as (files: File[], channel: t.Channel, draftType: Number) => void
};

export const ApplicationAssetUtils = mapMangledModuleLazy("getAssetImage: size must === [", {
    fetchAssetIds: filters.byCode('.startsWith("http:")', ".dispatch({"),
    getAssetFromImageURL: filters.byCode("].serialize(", ":null"),
    getAssetImage: filters.byCode("getAssetImage: size must === ["),
    getAssets: filters.byCode(".assets")
});

export const NavigationRouter: t.NavigationRouter = mapMangledModuleLazy("transitionTo - Transitioning to", {
    transitionTo: filters.byCode("transitionTo -"),
    transitionToGuild: filters.byCode("transitionToGuild -"),
    back: filters.byCode("goBack()"),
    forward: filters.byCode("goForward()"),
});
export const ChannelRouter: t.ChannelRouter = mapMangledModuleLazy('"Thread must have a parent ID."', {
    transitionToChannel: filters.byCode(".openTextInVoiceIfVoiceChannel"),
    transitionToThread: filters.byCode('"Thread must have a parent ID."')
});

export const SettingsRouter: any = mapMangledModuleLazy('type:"USER_SETTINGS_MODAL_OPEN"', {
    openUserSettings: filters.byCode('type:"USER_SETTINGS_MODAL_OPEN"')
});

export const PermissionsBits: t.PermissionsBits = findLazy(m => typeof m.ADMINISTRATOR === "bigint");

export const { zustandCreate } = mapMangledModuleLazy(["useSyncExternalStoreWithSelector:", "Object.assign"], {
    zustandCreate: filters.byCode(/=>(\i)\?\i\(\1/)
});

export const { zustandPersist } = mapMangledModuleLazy(".onRehydrateStorage)?", {
    zustandPersist: filters.byCode(/(\(\i,\i\))=>.+?\i\1/)
});

export const MessageActions = findByPropsLazy("editMessage", "sendMessage");
export const MessageCache = findByPropsLazy("clearCache", "_channelMessages");
export const UserProfileActions = {
    openUserProfileModal: findByCodeLazy('type:"USER_PROFILE_MODAL_OPEN"')
};
export const InviteActions = findByPropsLazy("resolveInvite");
export const ChannelActionCreators = findByPropsLazy("openPrivateChannel");

export const IconUtils: t.IconUtils = findByPropsLazy("getGuildBannerURL", "getUserAvatarURL");

export const ExpressionPickerStore: t.ExpressionPickerStore = mapMangledModuleLazy("expression-picker-last-active-view", {
    openExpressionPicker: filters.byCode(/setState\({activeView:(?:(?!null)\i),activeViewType:/),
    closeExpressionPicker: filters.byCode("setState({activeView:null"),
    toggleMultiExpressionPicker: filters.byCode(".EMOJI,"),
    toggleExpressionPicker: filters.byCode(/\i\.activeView===\i&&\i\.activeViewType===\i&&/),
    setExpressionPickerView: filters.byCode(/setState\({activeView:\i,lastActiveView:/),
    setSearchQuery: filters.byCode("searchQuery:"),
    useExpressionPickerStore: filters.byCode(/\(\i,\i=\i\)=>/)
});

export const PopoutActions: t.PopoutActions = mapMangledModuleLazy('type:"POPOUT_WINDOW_OPEN"', {
    open: filters.byCode('type:"POPOUT_WINDOW_OPEN"'),
    close: filters.byCode('type:"POPOUT_WINDOW_CLOSE"'),
    setAlwaysOnTop: filters.byCode('type:"POPOUT_WINDOW_SET_ALWAYS_ON_TOP"'),
});

export const UsernameUtils: t.UsernameUtils = findByPropsLazy("useName", "getGlobalName");
export const DisplayProfileUtils: t.DisplayProfileUtils = mapMangledModuleLazy(/=\i\.getUserProfile\(\i\),\i=\i\.getGuildMemberProfile\(/, {
    getDisplayProfile: filters.byCode(".getGuildMemberProfile("),
    useDisplayProfile: filters.byCode(/\[\i\.\i,\i\.\i],\(\)=>/)
});

export const DateUtils: t.DateUtils = mapMangledModuleLazy("millisecondsInUnit:", {
    calendarFormat: filters.byCode('<-1?"sameElse":'),
    dateFormat: filters.byCode('<2?"nextDay":"sameElse";'),
    isSameDay: filters.byCode(/Math\.abs\(\i-\i\)/),
    diffAsUnits: filters.byCode("days:0", "millisecondsInUnit")
});

export const MessageTypeSets: t.MessageTypeSets = findByPropsLazy("REPLYABLE", "FORWARDABLE");

export const useDrag = findByCodeLazy("useDrag::spec.begin was deprecated");
// you cant make a better finder i love that they remove display names sm

export const useDrop = findByCodeLazy(".disconnectDropTarget()", ".dropTargetOptions=");

export const VoiceActions = findByPropsLazy("toggleSelfMute");

export const GuildActions = findByPropsLazy("setServerMute", "setServerDeaf");

export const ChannelActions = findByPropsLazy("selectChannel", "selectVoiceChannel");

export const DraftActions = findByPropsLazy("saveDraft", "changeDraft");

export const PinActions = findByPropsLazy("pinMessage", "unpinMessage");

export const ColorUtils = mapMangledModuleLazy("Invalid hex color format", {
    rgbToHex: filters.byCode(".toString(16).slice(1)"),
    hexToRgba: filters.byCode("`rgba(${"),
    hexToRgb: filters.byCode(".rgb();return"),
    rgbToHsl: filters.byCode("saturation:", "lightness:"),
    mixColors: filters.byCode(".substring(1,3),16)"),
    hexWithAlpha: filters.byCode("Invalid hex color format"),
    getDominantColor: filters.byCode("hex:", "hsv:"),
    generatePalette: filters.byCode("360/("),
});

export const ImageUtils = mapMangledModuleLazy("Input data is not a valid image.", {
    extractColors: filters.byCode('"number"==typeof'),
    fileToDataURL: filters.byCode("Result must be a string"),
    dataURLToBlob: filters.byCode("new Uint8Array("),
    dataURLToFile: filters.byCode("new File(["),
    fitDimensions: filters.byCode("minWidth:", "minHeight:"),
    loadImage: filters.byCode('addEventListener("load"'),
    isAnimatedPNG: filters.byCode("File is not a PNG"),
    base64Size: filters.byCode("Input data is not a valid image."),
});

export const ReadStateUtils = mapMangledModuleLazy('type:"ENABLE_AUTOMATIC_ACK",', {
    ackChannel: filters.byCode(".isForumLikeChannel(")
});

export const fetchApplicationsRPC = findByCodeLazy('"Invalid Origin"', ".application");

export const CloudUploader = findLazy(m => m.prototype?.trackUploadFinished) as typeof t.CloudUpload;

export const URLUtils: t.URLUtils = findByPropsLazy("URL_REGEX", "makeUrl", "isDiscordUrl");

export const Humanize: t.Humanize = findByPropsLazy("filesize", "relativeTime", "ordinal");
