/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The badges CustomProfile can show: Discord's own, by flag, the special ones and the tiered ones, with their icons

import { t } from "@utils/i18n";

export const FLAG = {
    STAFF: 1,
    PARTNER: 2,
    HYPESQUAD: 4,
    BUG_HUNTER_1: 8,
    BRAVERY: 64,
    BRILLIANCE: 128,
    BALANCE: 256,
    EARLY_SUPPORTER: 512,
    BUG_HUNTER_2: 16384,
    DEV_VERIFIED: 131072,
    MOD_ALUMNI: 262144,
    ACTIVE_DEVELOPER: 4194304,
};

export const OLD_NAME_BADGE_ICON = "https://cdn.discordapp.com/badge-icons/6de6d34650760ba5551a79732e98ed60.png";

export const BADGES = [
    { label: t("Discord Staff"), flag: FLAG.STAFF, icon: "https://cdn.discordapp.com/badge-icons/5e74e9b61934fc1f67c65515d1f7e60d.png" },
    { label: t("Partnered Server Owner"), flag: FLAG.PARTNER, icon: "https://cdn.discordapp.com/badge-icons/3f9748e53446a137a052f3454e2de41e.png" },
    { label: t("Moderator Programs Alumni"), flag: FLAG.MOD_ALUMNI, icon: "https://cdn.discordapp.com/badge-icons/fee1624003e2fee35cb398e125dc479b.png" },
    { label: t("HypeSquad Events"), flag: FLAG.HYPESQUAD, icon: "https://cdn.discordapp.com/badge-icons/bf01d1073931f921909045f3a39fd264.png" },
    { label: t("HypeSquad Bravery"), flag: FLAG.BRAVERY, icon: "https://cdn.discordapp.com/badge-icons/8a88d63823d8a71cd5e390baa45efa02.png" },
    { label: t("HypeSquad Brilliance"), flag: FLAG.BRILLIANCE, icon: "https://cdn.discordapp.com/badge-icons/011940fd013da3f7fb926e4a1cd2e618.png" },
    { label: t("HypeSquad Balance"), flag: FLAG.BALANCE, icon: "https://cdn.discordapp.com/badge-icons/3aa41de486fa12454c3761e8e223442e.png" },
    { label: t("Early Supporter"), flag: FLAG.EARLY_SUPPORTER, icon: "https://cdn.discordapp.com/badge-icons/7060786766c9c840eb3019e725d2b358.png" },
    { label: t("Bug Hunter Level 2"), flag: FLAG.BUG_HUNTER_2, icon: "https://cdn.discordapp.com/badge-icons/848f79194d4be5ff5f81505cbd0ce1e6.png" },
    { label: t("Bug Hunter Level 1"), flag: FLAG.BUG_HUNTER_1, icon: "https://cdn.discordapp.com/badge-icons/2717692c7dca7289b35297368a940dd0.png" },
    { label: t("Early Verified Bot Developer"), flag: FLAG.DEV_VERIFIED, icon: "https://cdn.discordapp.com/badge-icons/6df5892e0f35b051f8b61eace34f4967.png" },
    { label: t("Active Developer"), flag: FLAG.ACTIVE_DEVELOPER, icon: "https://cdn.discordapp.com/badge-icons/6bdc42827a38498929a4920da12695d9.png" },
];

export const SPECIAL_BADGES: Record<string, { label: string; icon: string }> = {
    oldname: { label: t("Old username"), icon: OLD_NAME_BADGE_ICON },
    quest: { label: t("Completed a quest"), icon: "https://cdn.discordapp.com/badge-icons/7d9ae358c8c5e118768335dbe68b4fb8.png" },
    meadow: { label: t("Last Meadow Online"), icon: "https://cdn.discordapp.com/badge-icons/ca105ad9cfc8580c765101d17bbb2323.png" },
    orbs: { label: t("Orbs — Apprentice"), icon: "https://cdn.discordapp.com/badge-icons/83d8a1eb09a8d64e59233eec5d4d5c2d.png" },
    gift_patron: { label: t("Gifting — Patron"), icon: "https://cdn.discordapp.com/assets/content/5a2c578f82445956549c6454a2d65f8ba35b53f59120a4aa55855098ce5a653d.png" },
    gift_champion: { label: t("Gifting — Champion"), icon: "https://cdn.discordapp.com/assets/content/ac865fd339fbaa75d77278cd695936f168cd9b88dbbd72fdaeb76174bc0039d3.png" },
    gift_luminary: { label: t("Gifting — Luminary"), icon: "https://cdn.discordapp.com/assets/content/35885be90179a2b4cc4e29aaf1285fe561c837f037aa805df40e921fd8db4867.png" },
    gift_icon: { label: t("Gifting — Icon"), icon: "https://cdn.discordapp.com/assets/content/70b46c1ea400bc57e2d5ac937c70b7ef25599feb1c62d7817c257f19051f1460.png" },
    gift_hero: { label: t("Gifting — Hero"), icon: "https://cdn.discordapp.com/assets/content/779d517e251fd2f6c4d64b4bf5839ea20cc5e061a2f971c7811ab2486ccf4553.png" },
    gift_legendary: { label: t("Gifting — Legendary"), icon: "https://cdn.discordapp.com/assets/content/eb5ce89c01c7884a614b5be0ebadb0d86215b61b55c04a01d27cffb131b4a070.png" },
};

export const GIFT_IDS = ["gift_patron", "gift_champion", "gift_luminary", "gift_icon", "gift_hero", "gift_legendary"];
export const GIFT_TIER_NAMES = ["Patron", "Champion", "Luminary", "Icon", "Hero", "Legend"];

export const NITRO_LEVELS = [
    { label: t("Nitro (0 months)"), icon: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png" },
    { label: t("Bronze (1 month)"), icon: "https://cdn.discordapp.com/badge-icons/4f33c4a9c64ce221936bd256c356f91f.png" },
    { label: t("Silver (3 months)"), icon: "https://cdn.discordapp.com/badge-icons/4514fab914bdbfb4ad2fa23df76121a6.png" },
    { label: t("Gold (6 months)"), icon: "https://cdn.discordapp.com/badge-icons/2895086c18d5531d499862e41d1155a6.png" },
    { label: t("Platinum (12 months)"), icon: "https://cdn.discordapp.com/badge-icons/0334688279c8359120922938dcb1d6f8.png" },
    { label: t("Diamond (24 months)"), icon: "https://cdn.discordapp.com/badge-icons/0d61871f72bb9a33a7ae568c1fb4f20a.png" },
    { label: t("Emerald (36 months)"), icon: "https://cdn.discordapp.com/badge-icons/11e2d339068b55d3a506cff34d3780f3.png" },
    { label: t("Ruby (60 months)"), icon: "https://cdn.discordapp.com/badge-icons/cd5e2cfd9d7f27a8cdcd3e8a8d5dc9f4.png" },
    { label: t("Opal (72 months)"), icon: "https://cdn.discordapp.com/badge-icons/5b154df19c53dce2af92c9b61e6be5e2.png" },
];
export const NITRO_LEVEL_MONTHS = [0, 1, 3, 6, 12, 24, 36, 60, 72];

export const BOOST_LABELS_RAW = [
    "1 Month", "2 Months", "3 Months", "6 Months",
    "9 Months", "12 Months", "15 Months", "18 Months", "24 Months"
];
export const BOOST_LABELS = BOOST_LABELS_RAW.map(l => t(l));
export const BOOST_ICONS = [
    "https://cdn.discordapp.com/badge-icons/51040c70d4f20a921ad6674ff86fc95c.png",
    "https://cdn.discordapp.com/badge-icons/0e4080d1d333bc7ad29ef6528b6f2fb7.png",
    "https://cdn.discordapp.com/badge-icons/72bed924410c304dbe3d00a6e593ff59.png",
    "https://cdn.discordapp.com/badge-icons/df199d2050d3ed4ebf84d64ae83989f8.png",
    "https://cdn.discordapp.com/badge-icons/996b3e870e8a22ce519b3a50e6bdd52f.png",
    "https://cdn.discordapp.com/badge-icons/991c9f39ee33d7537d9f408c3e53141e.png",
    "https://cdn.discordapp.com/badge-icons/cb3ae83c15e970e8f3d410bc62cb8b99.png",
    "https://cdn.discordapp.com/badge-icons/7142225d31238f6387d9f09efaa02759.png",
    "https://cdn.discordapp.com/badge-icons/ec92202290b48d0879b7413d2dde3bab.png",
];

// Discord's tiered badges (2026). Icons and tier names come from Discord's badge catalog.
export interface BadgeTier { label: string; icon: string; }
export const TIERED_BADGES: Array<{ key: string; label: string; tiers: BadgeTier[]; }> = [
    {
        key: "account_age",
        label: "Account Age",
        tiers: [
            { label: "Seed", icon: "https://cdn.discordapp.com/assets/content/8da9339b9d405f0194947e607c839b1bd43436211e5bf07fe7f4ce005578e9e4.png" },
            { label: "Sprout", icon: "https://cdn.discordapp.com/assets/content/f12847ebadd9022c3d67e5b31b5f3608e1ff48a222528fb6059e0fd310fc71b7.png" },
            { label: "Sapling", icon: "https://cdn.discordapp.com/assets/content/dccc28b53d39406e65e76541d6b940b23a9d31ef418100d77d6eb30c4adb9098.png" },
            { label: "Bud", icon: "https://cdn.discordapp.com/assets/content/7c0a10981060861722c0216fd6c01a9fd8b10accbd3d6a04dcde275896e82e8b.png" },
            { label: "Blossom", icon: "https://cdn.discordapp.com/assets/content/52c374af536a4621a65503b4350f7459e3d00f3ed4e3b941c3902c0d9af45f4a.png" },
            { label: "Redwood", icon: "https://cdn.discordapp.com/assets/content/8041acaf604df1ace1ad2a12fd020513e50dfdd09899dc2e455e622d41c91000.png" },
            { label: "Sequoia", icon: "https://cdn.discordapp.com/assets/content/7c5a1b1ce27181145c7e37bf6ad323353c14e8db201cfa3cb336292ad9a5d03d.png" },
            { label: "Bristlecone", icon: "https://cdn.discordapp.com/assets/content/53b3a2b4307df9dfc05a4c9da977baa4a6fd822f5a3d24843f949d1c93398322.png" },
            { label: "Stromatolite", icon: "https://cdn.discordapp.com/assets/content/d30993594816cc6035041941291dc7a5862e55676ce85eef91f89fd0c59f2931.png" },
            { label: "Primordial", icon: "https://cdn.discordapp.com/assets/content/1930d04a8a1d0aba6f97b19b7e7b87158ab154ebffd5468d6ada66671285968b.png" },
        ]
    },
    {
        key: "streaming",
        label: "Streaming",
        tiers: [
            { label: "Newcomer", icon: "https://cdn.discordapp.com/assets/content/571a6f607289dfc034d5735ea020bb53f29e9d53dcc54ee852f9f070538ff73a.png" },
            { label: "Fledgling", icon: "https://cdn.discordapp.com/assets/content/3e1ec0a72ca812e53ecd53d55c18c2d9765cc89eee08b1e74f7e0bdbfe2e96a2.png" },
            { label: "Breakout", icon: "https://cdn.discordapp.com/assets/content/443707ffced738635bb0ee5c054544c67ec9dfab63b03e661bc1295d5399cac7.png" },
            { label: "Standout", icon: "https://cdn.discordapp.com/assets/content/522de4edcb75e0544633b9ccb55c58d672c4a2fa70a81231bd42bb56cd6555bd.png" },
            { label: "Trendsetter", icon: "https://cdn.discordapp.com/assets/content/9482ad3a1104986a4cce2979291c733eca0707f6218ddfb6ff36e32e3fd709e9.png" },
            { label: "Headliner", icon: "https://cdn.discordapp.com/assets/content/2cf2a4ab39800a963efdb900b823dc8ccb23464434f3e11d329851ae566cac22.png" },
            { label: "Star", icon: "https://cdn.discordapp.com/assets/content/20e0b4ff7fc63681efe95082a69f9bfe7259f1485fa6fa6cebaf709336f42b90.png" },
            { label: "Sensation", icon: "https://cdn.discordapp.com/assets/content/7ceb7fc55dba1fd4c4c5a9acd8345e3b74bca789bf8503445f3bf89109ae47a4.png" },
            { label: "Visionary", icon: "https://cdn.discordapp.com/assets/content/5fbabf24366e08c5f7a56219d7d39f29c41034b5bd091573600f07a904af0035.png" },
            { label: "Phenomenon", icon: "https://cdn.discordapp.com/assets/content/dd20ac476f0bb7ea9a553abc699c0d6b9854a3f802187e3bf9bf2e45c37a766a.png" },
        ]
    },
    {
        key: "game_time",
        label: "Game Time",
        tiers: [
            { label: "Casual", icon: "https://cdn.discordapp.com/assets/content/c2844b37da74241525c1001c2ae5dd2719beb0095af8f88dcb35a37ceb0e1892.png" },
            { label: "Recreational", icon: "https://cdn.discordapp.com/assets/content/157b789531c602542070e680c410d74275e796b6c45cd717292f6d2a59593972.png" },
            { label: "Dedicated", icon: "https://cdn.discordapp.com/assets/content/d6ab0696aae97fca8e6b2b88d4117f09f9ea895d4f0cebee770564369ff06873.png" },
            { label: "Committed", icon: "https://cdn.discordapp.com/assets/content/cc1edd8d955872cd9fbd9bafec80c973287817560d0895587686e3e1671a698e.png" },
            { label: "Serious", icon: "https://cdn.discordapp.com/assets/content/4039caeef586467d50939f3154f87828645d6f1bd699b8f0c1da686b02cefe68.png" },
            { label: "Devoted", icon: "https://cdn.discordapp.com/assets/content/3d39b6cef7f00fe9e2d51f229034650b900481823af05d09e6537e912de30301.png" },
            { label: "Seasoned", icon: "https://cdn.discordapp.com/assets/content/46512ce94203c84d7919904acfbd07fc5a8316010a610b8fd6a1cc937e5ac75e.png" },
            { label: "Ironclad", icon: "https://cdn.discordapp.com/assets/content/9bff716e6bae2ef42dc959bac05a0dfc480bf89484c111ed7fb4aa0332cb22d8.png" },
            { label: "Unshakeable", icon: "https://cdn.discordapp.com/assets/content/1f51d59934543176d8b585c4e5a62d77ca3677c6e26ae4da74b1b639f9091b5e.png" },
            { label: "Eternal", icon: "https://cdn.discordapp.com/assets/content/8a62ba720addf7584d3e7f82170104e6a2b35aea4aba5ffc7260cfd706f40c37.png" },
        ]
    },
    {
        key: "game_variety",
        label: "Game Variety",
        tiers: [
            { label: "Sampler", icon: "https://cdn.discordapp.com/assets/content/cbd75cae9bca1c49b35eb0d9c189af4c8604b4f69a1de17ae550db9f03cbd371.png" },
            { label: "Dabbler", icon: "https://cdn.discordapp.com/assets/content/c9fe2cefaf224c0fb73a5fe11476987930809fa307069deb8bbb2f0b99bac545.png" },
            { label: "Enthusiast", icon: "https://cdn.discordapp.com/assets/content/e016406cec55df228f6e4e7ee9ec5ac10cf0ccd5037c5926da5c26c44e32d374.png" },
            { label: "Ranger", icon: "https://cdn.discordapp.com/assets/content/7265bc6f9ff0a47962dafe01b6f9c8f75927392aaf48d48c3619d123d2b584f5.png" },
            { label: "Explorer", icon: "https://cdn.discordapp.com/assets/content/ffd4938d41c57d27fec0f253a54756c40add56f761c5b1471b531d838e8669db.png" },
            { label: "Adventurer", icon: "https://cdn.discordapp.com/assets/content/dcfdce8dfc254b6e8fa9cfba5dcd918f027e27554c3aa2403fe01eb319cf2194.png" },
            { label: "Voyager", icon: "https://cdn.discordapp.com/assets/content/183d6521c3696b0b42f73dd9c319307490982a5dffdc34a923b760d82b20916a.png" },
            { label: "Maverick", icon: "https://cdn.discordapp.com/assets/content/84d4695cdcbb350ad5385c06e87caf06835872135625a8bff6bac300af858412.png" },
            { label: "Polymath", icon: "https://cdn.discordapp.com/assets/content/1d8d9e3254727d1a1c01b194f2d01ade4525dc8b85c39b877af09768eaf031be.png" },
            { label: "Universalist", icon: "https://cdn.discordapp.com/assets/content/4731855cd51c1d45fd14dc088b80815ea0562a353b48db369092019fbcb44ec7.png" },
        ]
    },
];

// Each badge's levels, for its page
export const BOOST_LEVELS = BOOST_ICONS.map((icon, i) => ({ label: BOOST_LABELS[i], icon }));
export const GIFT_LEVELS = GIFT_IDS.map((id, i) => ({ label: GIFT_TIER_NAMES[i], icon: SPECIAL_BADGES[id].icon }));
