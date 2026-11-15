/**
 * @template T
 * @param {T[]} arr
 * @param {(v: T) => boolean} predicate
 */
function removeFirst(arr, predicate) {
    const idx = arr.findIndex(predicate);
    if (idx !== -1) arr.splice(idx, 1);
}

/** Discord's own three apps. Its other subdomains (support, status...) are other sites and keep their headers */
function isDiscordPage(url) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === "https:" && ["discord.com", "ptb.discord.com", "canary.discord.com"].includes(hostname);
    } catch {
        return false;
    }
}

chrome.webRequest.onHeadersReceived.addListener(
    ({ responseHeaders, type, url }) => {
        if (!responseHeaders) return;

        if (type === "main_frame" && isDiscordPage(url)) {
            // In main frame requests, the CSP needs to be removed to enable fetching of custom css
            // as desired by the user
            removeFirst(responseHeaders, h => h.name.toLowerCase() === "content-security-policy");
        } else if (type === "stylesheet" && url.startsWith("https://raw.githubusercontent.com/")) {
            // Most users will load css from GitHub, but GitHub doesn't set the correct content type,
            // so we fix it here
            removeFirst(responseHeaders, h => h.name.toLowerCase() === "content-type");
            responseHeaders.push({
                name: "Content-Type",
                value: "text/css"
            });
        }
        return { responseHeaders };
    },
    { urls: ["https://raw.githubusercontent.com/*", "https://discord.com/*", "https://ptb.discord.com/*", "https://canary.discord.com/*"], types: ["main_frame", "stylesheet"] },
    ["blocking", "responseHeaders"]
);
