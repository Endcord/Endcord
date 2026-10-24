/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Link } from "@components/Link";
import { RenderModalProps } from "@endcord/discord-types";
import { settings } from "@plugins/decor/settings";
import { DecorationModalClasses, requireAvatarDecorationModal } from "@plugins/decor/ui";
import { t } from "@utils/i18n";
import { ConfirmModal, Forms, openModal } from "@webpack/common";

import { openCreateDecorationModal } from "./CreateDecorationModal";

function GuidelinesModal(props: RenderModalProps) {
    return (
        <ConfirmModal
            {...props}
            title={t("Hold on")}
            confirmText={t("Continue")}
            variant="primary"
            onConfirm={() => {
                settings.store.agreedToGuidelines = true;
                props.onClose();
                openCreateDecorationModal();
            }}
        >
            <div className={DecorationModalClasses.modal}>
                <Forms.FormText>
                    {t("By submitting a decoration, you agree to")}{" "}<Link
                        href="https://github.com/decor-discord/.github/blob/main/GUIDELINES.md"
                    >
                        {t("the guidelines")}</Link>.{" "}{t("Not reading these guidelines may get your account suspended from creating more decorations in the future.")}
                </Forms.FormText>
            </div>
        </ConfirmModal>
    );
}

export const openGuidelinesModal = () =>
    requireAvatarDecorationModal().then(() => openModal(props => <GuidelinesModal {...props} />));
