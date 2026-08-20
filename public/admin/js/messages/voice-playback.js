(function defineMessagesVoicePlaybackModule() {
  const modules = window.ResQMeshMessagesModules = window.ResQMeshMessagesModules || {};

  function createVoicePlayback(context) {
    const { state, api, formatters } = context;

    function getVoiceDurationForMessage(messageId) {
      const message = state.messages.find((item) => Number(item.id) === Number(messageId));
      return Number(message?.voiceClip?.durationSeconds || 0);
    }

    function syncVoiceControls() {
      document.querySelectorAll('[data-voice-control-id]').forEach((control) => {
        const messageId = Number(control.getAttribute('data-voice-control-id'));
        const isLoading = state.voiceLoadingMessageId === messageId;
        const isPlaying = state.activeVoiceMessageId === messageId && Boolean(state.activeVoiceAudio);
        const isError = state.voiceErrorMessageId === messageId;
        const duration = isPlaying
          ? state.voiceDurationSeconds || getVoiceDurationForMessage(messageId)
          : getVoiceDurationForMessage(messageId);
        const position = isPlaying ? state.voicePositionSeconds : 0;
        const progress = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;
        const icon = control.querySelector('[data-voice-icon]');
        const status = control.querySelector('[data-voice-status]');
        const time = control.querySelector('[data-voice-time]');
        const fill = control.querySelector('[data-voice-progress]');

        control.classList.toggle('is-loading', isLoading);
        control.classList.toggle('is-playing', isPlaying);
        control.classList.toggle('is-error', isError);

        if (icon) {
          icon.className = isLoading
            ? 'fa-solid fa-spinner fa-spin'
            : isError
              ? 'fa-solid fa-triangle-exclamation'
              : isPlaying
                ? 'fa-solid fa-pause'
                : 'fa-solid fa-play';
        }

        if (status) {
          status.textContent = isLoading
            ? 'Loading'
            : isError
              ? 'Unavailable'
              : isPlaying
                ? 'Playing'
                : 'Voice message';
        }

        if (time) {
          time.textContent = duration > 0
            ? `${formatters.formatVoiceTime(position)} / ${formatters.formatVoiceTime(duration)}`
            : '0:00';
        }

        if (fill) {
          fill.style.width = `${Math.max(isPlaying ? 4 : 0, progress)}%`;
        }
      });
    }

    function resetVoicePlaybackState() {
      state.activeVoiceMessageId = null;
      state.activeVoiceAudio = null;
      state.voiceLoadingMessageId = null;
      state.voicePositionSeconds = 0;
      state.voiceDurationSeconds = 0;
    }

    function stopVoicePlayback() {
      if (state.activeVoiceAudio) {
        state.activeVoiceAudio.pause();
        state.activeVoiceAudio.currentTime = 0;
      }

      resetVoicePlaybackState();
      syncVoiceControls();
    }

    async function playVoiceClip(messageId) {
      if (state.activeVoiceMessageId === messageId && state.activeVoiceAudio) {
        state.activeVoiceAudio.pause();
        state.activeVoiceAudio.currentTime = 0;
        resetVoicePlaybackState();
        syncVoiceControls();
        return;
      }

      if (state.activeVoiceAudio) {
        state.activeVoiceAudio.pause();
        state.activeVoiceAudio.currentTime = 0;
      }

      resetVoicePlaybackState();
      state.voiceLoadingMessageId = messageId;
      state.voiceErrorMessageId = null;
      syncVoiceControls();

      try {
        const clip = await api.fetchVoiceClip(messageId);
        if (!clip?.content) {
          throw new Error('Voice clip unavailable.');
        }

        const audio = new Audio(`data:${clip.mimeType || 'audio/mp4'};base64,${clip.content}`);
        state.activeVoiceAudio = audio;
        state.activeVoiceMessageId = messageId;
        state.voiceLoadingMessageId = null;
        state.voiceDurationSeconds = Number(clip.durationSeconds || 0);

        audio.addEventListener('loadedmetadata', () => {
          state.voiceDurationSeconds = Number.isFinite(audio.duration)
            ? audio.duration
            : Number(clip.durationSeconds || 0);
          syncVoiceControls();
        });
        audio.addEventListener('timeupdate', () => {
          state.voicePositionSeconds = audio.currentTime || 0;
          state.voiceDurationSeconds = Number.isFinite(audio.duration)
            ? audio.duration
            : state.voiceDurationSeconds;
          syncVoiceControls();
        });
        audio.addEventListener('pause', () => {
          if (state.activeVoiceMessageId === messageId && !audio.ended) {
            resetVoicePlaybackState();
            syncVoiceControls();
          }
        });
        audio.addEventListener('ended', () => {
          resetVoicePlaybackState();
          syncVoiceControls();
        }, { once: true });
        await audio.play();
        syncVoiceControls();
      } catch (error) {
        console.error(error);
        resetVoicePlaybackState();
        state.voiceErrorMessageId = messageId;
        syncVoiceControls();
      }
    }

    return {
      getVoiceDurationForMessage,
      syncVoiceControls,
      resetVoicePlaybackState,
      stopVoicePlayback,
      playVoiceClip
    };
  }

  modules.createVoicePlayback = createVoicePlayback;
}());
