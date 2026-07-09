/* ============================================================
   Dice & Monsters — Voice (ElevenLabs TTS + STT)
   ------------------------------------------------------------
   Optional voice layer for the AI Dungeon Master:
     - TTS: read the DM's narration aloud (text → speech).
     - STT: talk to the DM with your mic (speech → text).

   Local-first & additive: the ElevenLabs key lives only in the
   user's browser (localStorage, BYOK) and is sent straight to
   ElevenLabs, exactly like the Anthropic BYOK transport. If no
   key is set (or the browser can't record), everything no-ops
   and the app runs exactly as before.

   Nothing here touches game state — callers pass text / audio and
   get audio / text back.
   ============================================================ */
(function () {
  'use strict';

  var KEY_LS       = 'diceAndMonsters.elevenKey';
  var VOICE_LS     = 'diceAndMonsters.elevenVoice';
  var TTS_MODEL_LS = 'diceAndMonsters.elevenTtsModel';
  var STT_MODEL_LS = 'diceAndMonsters.elevenSttModel';
  var AUTO_LS      = 'diceAndMonsters.voiceAuto';   // auto-speak the DM ('1'/'0')

  // Rachel — a premade voice available on every account. Users can paste
  // any voice id from their ElevenLabs library.
  // George — a warm, mature British narrator: the closest premade voice to the
  // "wise documentary narrator" feel (think Freeman × Attenborough). Available
  // on every account. Users can override with any voice id from their library.
  var DEFAULT_VOICE     = 'JBFqnCBsd6RMkjVDRZzb';
  // Multilingual v2 handles English *and* Norwegian, so the DM speaks
  // whatever language it narrates in.
  var DEFAULT_TTS_MODEL = 'eleven_multilingual_v2';
  var DEFAULT_STT_MODEL = 'scribe_v1';

  // A short curated list of premade voices that suit a Dungeon Master narrator,
  // so users can pick one without hunting for ids. All are default/shared voices
  // available to every account. Warm narrators first.
  var PRESETS = [
    { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George — warm British narrator (Freeman × Attenborough vibe)' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel — deep, authoritative British' },
    { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian — deep American narrator' },
    { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill — older American, documentary' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam — deep American' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold — gravelly, intense' },
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel — calm American (default female)' }
  ];

  var TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech/';
  var STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

  function lsGet(k, dflt) { try { return window.localStorage.getItem(k) || dflt; } catch (e) { return dflt; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v == null ? '' : v); } catch (e) { /* ignore */ } }

  function getKey() { return lsGet(KEY_LS, ''); }
  function setKey(k) { lsSet(KEY_LS, (k || '').trim()); }
  function hasKey() { return !!getKey(); }

  function getVoice() { return lsGet(VOICE_LS, '') || DEFAULT_VOICE; }
  function setVoice(v) { lsSet(VOICE_LS, (v || '').trim()); }

  function getTtsModel() { return lsGet(TTS_MODEL_LS, '') || DEFAULT_TTS_MODEL; }
  function setTtsModel(m) { lsSet(TTS_MODEL_LS, (m || '').trim()); }
  function getSttModel() { return lsGet(STT_MODEL_LS, '') || DEFAULT_STT_MODEL; }

  function isAuto() { return lsGet(AUTO_LS, '0') === '1'; }
  function setAuto(on) { lsSet(AUTO_LS, on ? '1' : '0'); }

  // Can this browser record from the mic?
  function canRecord() {
    return !!(window.navigator && navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  /* ---- Text → speech (playback) ---- */
  var current = null;   // the Audio element currently playing (if any)
  var queue = [];       // pending lines to speak in order
  var draining = false;

  function stop() {
    queue = [];
    draining = false;
    if (current) {
      try { current.pause(); } catch (e) { /* ignore */ }
      if (current.src) { try { URL.revokeObjectURL(current.src); } catch (e) { /* ignore */ } }
      current = null;
    }
  }

  // Fetch audio for one line and play it, resolving when playback *ends*.
  function playOnce(text) {
    var body = {
      text: text,
      model_id: getTtsModel(),
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    };
    var url = TTS_URL + encodeURIComponent(getVoice()) + '?output_format=mp3_44100_128';
    return fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': getKey(), 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) { throw new Error(errMsg('ElevenLabs TTS', res.status, txt)); });
      }
      return res.blob();
    }).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var audio = new Audio(URL.createObjectURL(blob));
        current = audio;
        function done() { if (current === audio) { try { URL.revokeObjectURL(audio.src); } catch (e) {} current = null; } resolve(); }
        audio.addEventListener('ended', done);
        audio.addEventListener('error', function () { reject(new Error('Audio playback failed.')); });
        audio.play().catch(reject);
      });
    });
  }

  // speak(text) → Promise. Interrupts anything queued/playing and speaks now.
  function speak(text) {
    text = (text || '').trim();
    if (!text) return Promise.resolve();
    if (!hasKey()) return Promise.reject(new Error('No ElevenLabs key set.'));
    stop();
    return playOnce(text);
  }

  // enqueue(text) → queue a line to be spoken after any earlier ones finish.
  // Returns a Promise for the last drain error (if any), best-effort.
  function enqueue(text) {
    text = (text || '').trim();
    if (!text) return Promise.resolve();
    if (!hasKey()) return Promise.reject(new Error('No ElevenLabs key set.'));
    queue.push(text);
    return drain();
  }

  function drain() {
    if (draining) return Promise.resolve();
    draining = true;
    return (function next() {
      if (!queue.length) { draining = false; return Promise.resolve(); }
      var line = queue.shift();
      return playOnce(line).then(next, function (err) {
        draining = false; queue = [];
        throw err;
      });
    })();
  }

  /* ---- Speech → text (recording + transcription) ---- */
  var recorder = null, chunks = [], stream = null;

  // Start capturing mic audio. Resolves once recording is live.
  function startRecording() {
    if (!canRecord()) return Promise.reject(new Error('This browser cannot record audio.'));
    if (recorder) return Promise.reject(new Error('Already recording.'));
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      chunks = [];
      recorder = new MediaRecorder(s);
      recorder.addEventListener('dataavailable', function (e) {
        if (e.data && e.data.size) chunks.push(e.data);
      });
      recorder.start();
    });
  }

  function releaseStream() {
    if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* ignore */ } }); stream = null; }
  }

  // Stop recording and transcribe. Resolves with the recognised text.
  function stopAndTranscribe() {
    if (!recorder) return Promise.reject(new Error('Not recording.'));
    var rec = recorder;
    return new Promise(function (resolve, reject) {
      rec.addEventListener('stop', function () {
        recorder = null;
        releaseStream();
        var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || 'audio/webm' });
        chunks = [];
        transcribe(blob).then(resolve, reject);
      });
      try { rec.stop(); } catch (e) { recorder = null; releaseStream(); reject(e); }
    });
  }

  // Cancel an in-progress recording without transcribing.
  function cancelRecording() {
    if (recorder) { try { recorder.stop(); } catch (e) { /* ignore */ } recorder = null; }
    chunks = [];
    releaseStream();
  }

  function isRecording() { return !!recorder; }

  // transcribe(blob) → Promise<string>. Sends audio to ElevenLabs STT.
  function transcribe(blob) {
    if (!hasKey()) return Promise.reject(new Error('No ElevenLabs key set.'));
    if (!blob || !blob.size) return Promise.reject(new Error('No audio captured.'));
    var form = new FormData();
    form.append('model_id', getSttModel());
    form.append('file', blob, 'speech.webm');
    return fetch(STT_URL, {
      method: 'POST',
      headers: { 'xi-api-key': getKey() },   // don't set content-type; the browser adds the multipart boundary
      body: form
    }).then(function (res) {
      return res.text().then(function (txt) {
        if (!res.ok) throw new Error(errMsg('ElevenLabs STT', res.status, txt));
        try { return (JSON.parse(txt).text || '').trim(); } catch (e) { return txt.trim(); }
      });
    });
  }

  function errMsg(what, status, txt) {
    var msg = txt;
    try {
      var j = JSON.parse(txt);
      if (j.detail && j.detail.message) msg = j.detail.message;
      else if (typeof j.detail === 'string') msg = j.detail;
      else if (j.message) msg = j.message;
    } catch (e) { /* keep raw */ }
    return what + ' ' + status + ': ' + msg;
  }

  window.Voice = {
    // key + settings
    getKey: getKey, setKey: setKey, hasKey: hasKey,
    getVoice: getVoice, setVoice: setVoice,
    getTtsModel: getTtsModel, setTtsModel: setTtsModel, getSttModel: getSttModel,
    isAuto: isAuto, setAuto: setAuto,
    DEFAULT_VOICE: DEFAULT_VOICE, DEFAULT_TTS_MODEL: DEFAULT_TTS_MODEL, PRESETS: PRESETS,
    // capability
    canRecord: canRecord, isRecording: isRecording,
    // TTS
    speak: speak, enqueue: enqueue, stop: stop,
    // STT
    startRecording: startRecording, stopAndTranscribe: stopAndTranscribe,
    cancelRecording: cancelRecording, transcribe: transcribe
  };
})();
