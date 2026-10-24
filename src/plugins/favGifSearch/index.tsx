/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin, { OptionType } from "@utils/types";
import { useCallback, useEffect, useRef, useState } from "@webpack/common";

interface SearchBarComponentProps {
    ref?: React.RefObject<any>;
    autoFocus: boolean;
    size: string;
    onChange: (query: string) => void;
    onClear: () => void;
    query: string;
    placeholder: string;
    className?: string;
}

type TSearchBarComponent =
    React.FC<SearchBarComponentProps>;

interface Gif {
    format: number;
    src: string;
    width: number;
    height: number;
    order: number;
    url: string;
}

interface Instance {
    dead?: boolean;
    state: {
        resultType?: string;
    };
    props: {
        favCopy: Gif[],

        favorites: Gif[],
    },
    forceUpdate: () => void;
}

export const settings = definePluginSettings({
    searchOption: {
        type: OptionType.SELECT,
        description: "The part of the url you want to search",
        options: [
            {
                label: "Entire Url",
                value: "url"
            },
            {
                label: "Path Only (/somegif.gif)",
                value: "path"
            },
            {
                label: "Host & Path (tenor.com somgif.gif)",
                value: "hostandpath",
                default: true
            }
        ] as const
    }
});

export default definePlugin({
    name: "FavoriteGifSearch",
    authors: [Devs.ewlle, Devs.kraethis, Devs.Sharp],
    description: "Adds a search bar to favorite gifs. Discord now has this built in, so the plugin no longer changes anything.",
    tags: ["Media", "Customisation"],

    // Discord's favorites tab ships its own search bar now, so these patches had nothing left to replace
    patches: [],

    settings,

    getTargetString,

    instance: null as Instance | null,
    renderSearchBar(instance: Instance, SearchBarComponent: TSearchBarComponent) {
        this.instance = instance;
        return (
            <ErrorBoundary noop>
                <SearchBar instance={instance} SearchBarComponent={SearchBarComponent} />
            </ErrorBoundary>
        );
    },

    getFav(favorites: Gif[]) {
        if (!this.instance || this.instance.dead) return favorites;
        const { favorites: filteredFavorites } = this.instance.props;

        return filteredFavorites != null && filteredFavorites?.length !== favorites.length ? filteredFavorites : favorites;

    }
});


function SearchBar({ instance, SearchBarComponent }: { instance: Instance; SearchBarComponent: TSearchBarComponent; }) {
    const [query, setQuery] = useState("");
    const ref = useRef<HTMLElement>(null);

    const onChange = useCallback((searchQuery: string) => {
        setQuery(searchQuery);
        const { props } = instance;

        // return early
        if (searchQuery === "") {
            props.favorites = props.favCopy;
            instance.forceUpdate();
            return;
        }


        // scroll back to top
        ref.current
            ?.closest("#gif-picker-tab-panel")
            ?.querySelector('[class*="scrollerBase"]')
            ?.scrollTo(0, 0);


        const result =
            props.favCopy
                .map(gif => ({
                    score: fuzzySearch(searchQuery.toLowerCase(), getTargetString(gif.url ?? gif.src).replace(/(%20|[_-])/g, " ").toLowerCase()),
                    gif,
                }))
                .filter(m => m.score != null) as { score: number; gif: Gif; }[];

        result.sort((a, b) => b.score - a.score);
        props.favorites = result.map(e => e.gif);

        instance.forceUpdate();
    }, [instance.state]);

    useEffect(() => {
        return () => {
            instance.dead = true;
        };
    }, []);

    return (
        <SearchBarComponent
            ref={ref}
            autoFocus={true}
            size="md"
            className=""
            onChange={onChange}
            onClear={() => {
                setQuery("");
                if (instance.props.favCopy != null) {
                    instance.props.favorites = instance.props.favCopy;
                    instance.forceUpdate();
                }
            }}
            query={query}
            placeholder={t("Search Favorite Gifs")}
        />
    );
}



export function getTargetString(urlStr: string) {
    let url: URL;
    try {
        url = new URL(urlStr);
    } catch (err) {
        // Can't resolve URL, return as-is
        return urlStr;
    }

    switch (settings.store.searchOption) {
        case "url":
            return url.href;
        case "path":
            if (url.host === "media.discordapp.net" || url.host === "tenor.com")
                // /attachments/899763415290097664/1095711736461537381/attachment-1.gif -> attachment-1.gif
                // /view/some-gif-hi-24248063 -> some-gif-hi-24248063
                return url.pathname.split("/").at(-1) ?? url.pathname;
            return url.pathname;
        case "hostandpath":
            if (url.host === "media.discordapp.net" || url.host === "tenor.com")
                return `${url.host} ${url.pathname.split("/").at(-1) ?? url.pathname}`;
            return `${url.host} ${url.pathname}`;

        default:
            return "";
    }
}

function fuzzySearch(searchQuery: string, searchString: string) {
    let searchIndex = 0;
    let score = 0;

    for (let i = 0; i < searchString.length; i++) {
        if (searchString[i] === searchQuery[searchIndex]) {
            score++;
            searchIndex++;
        } else {
            score--;
        }

        if (searchIndex === searchQuery.length) {
            return score;
        }
    }

    return null;
}
