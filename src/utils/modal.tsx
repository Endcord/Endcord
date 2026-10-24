/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { RenderModalProps } from "@endcord/discord-types";
import { filters, mapMangledModuleLazy } from "@webpack";
import { closeAllModals, closeModal, openMediaModal, openModal, openModalLazy } from "@webpack/common";
import type { ComponentType } from "react";

import { LazyComponent } from "./react";

/** Props a legacy modal render function receives. */
export type ModalProps = RenderModalProps;

/** @deprecated Migrate to new Modals */
export const enum ModalSize {
    SMALL = "small",
    MEDIUM = "medium",
    LARGE = "large",
    DYNAMIC = "dynamic",
}

/** @deprecated Migrate to new Modals */
export const Modals = mapMangledModuleLazy(".MODAL_ROOT_LEGACY,", {
    ModalRoot: filters.componentByCode('.MODAL,"aria-labelledby":'),
    ModalHeader: filters.componentByCode(",id:"),
    ModalContent: filters.componentByCode("scrollbarType:"),
    ModalFooter: filters.componentByCode(".HORIZONTAL_REVERSE,"),
    ModalCloseButton: filters.componentByCode(".withCircleBackground")
}) as Record<"ModalRoot" | "ModalHeader" | "ModalContent" | "ModalFooter" | "ModalCloseButton", ComponentType<any>>;

/** @deprecated Migrate to new Modals */
export const ModalRoot = LazyComponent(() => (Modals as any).ModalRoot) as ComponentType<any>;
/** @deprecated Migrate to new Modals */
export const ModalHeader = LazyComponent(() => (Modals as any).ModalHeader) as ComponentType<any>;
/** @deprecated Migrate to new Modals */
export const ModalContent = LazyComponent(() => (Modals as any).ModalContent) as ComponentType<any>;
/** @deprecated Migrate to new Modals */
export const ModalFooter = LazyComponent(() => (Modals as any).ModalFooter) as ComponentType<any>;
/** @deprecated Migrate to new Modals */
export const ModalCloseButton = LazyComponent(() => (Modals as any).ModalCloseButton) as ComponentType<any>;

/** @deprecated Migrate to new Modals */
export const ModalAPI = {
    openModal,
    openModalLazy,
    closeModal,
    closeAllModals
} as never;

export {
    /** @deprecated Migrate to new Modals */
    closeAllModals,
    /** @deprecated Migrate to new Modals */
    closeModal,
    /** @deprecated Migrate to new Modals */
    openMediaModal,
    /** @deprecated Migrate to new Modals */
    openModal,
    /** @deprecated Migrate to new Modals */
    openModalLazy
};
