/**
 * Card-outcome-form persistence — a thin re-export of nextcloudUserData.js's
 * key-value card-state functions. Used to be its own pa_links-based
 * create-then-delete-old dance (mirroring CardStateRepo.kt on Android); now
 * that outcomes live in the user's own Nextcloud as a plain JSON key,
 * "update" is just an overwrite, so this file barely does anything anymore
 * — kept only so CardDetailForm.vue's import doesn't need to change.
 */

export { loadCardState, saveCardState } from './nextcloudUserData.js'
