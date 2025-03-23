export const state = {
    keyBindsEnabled: true,
    enableKeyBinds: () => state.keyBindsEnabled = true,
    disableKeyBinds: () => state.keyBindsEnabled = false
}