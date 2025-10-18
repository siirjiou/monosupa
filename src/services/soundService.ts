export enum SoundEvent {
    DICE_ROLL,
    NEXT_TURN,
    PASS_GO,
    BUY_PROPERTY,
    PAY_RENT,
    GO_TO_JAIL,
    CHAT_MESSAGE,
    PLAYER_JOIN,
}

const soundFiles: Record<SoundEvent, string> = {
    [SoundEvent.DICE_ROLL]: 'https://aicade-ui-assets.s3.amazonaws.com/testing-branch/diceroll.mp3',
    [SoundEvent.NEXT_TURN]: 'https://aicade-ui-assets.s3.amazonaws.com/testing-branch/yourturn.mp3',
    [SoundEvent.PASS_GO]: 'https://aicade-ui-assets.s3.amazonaws.com/testing-branch/coins.mp3',
    [SoundEvent.BUY_PROPERTY]: 'https://aicade-ui-assets.s3.amazonaws.com/testing-branch/buy.mp3',
    [SoundEvent.PAY_RENT]: 'https://aicade-ui-assets.s3.amazonaws.com/testing-branch/cash.mp3',
    [SoundEvent.GO_TO_JAIL]: 'https://aicade-ui-assets.s3.amazonaws.com/testing-branch/jail.mp3',
    [SoundEvent.CHAT_MESSAGE]: 'https://aicade-ui-assets.s3.amazonaws.com/testing-branch/message.mp3',
    [SoundEvent.PLAYER_JOIN]: 'https://aicade-ui-assets.s3.amazonaws.com/testing-branch/join.mp3',
};

const audioCache: Partial<Record<SoundEvent, HTMLAudioElement>> = {};

let isMuted = false; // This service doesn't know about React state, so we use a local variable

export function playSound(event: SoundEvent) {
    if (isMuted) return;

    if (!audioCache[event]) {
        audioCache[event] = new Audio(soundFiles[event]);
    }

    const audio = audioCache[event];
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(error => {
            // Autoplay is often blocked by browsers until user interaction.
            // This is a common issue and usually resolves after the first user click.
            console.warn(`Could not play sound for event ${SoundEvent[event]}:`, error);
        });
    }
}

// The App component will call this function to sync the mute state
export function setMuted(muted: boolean) {
    isMuted = muted;
}