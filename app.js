(() => {
  'use strict';

  const SCRIPT = String(window.COURSE_SCRIPT || '').trim();
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const Utterance = window.SpeechSynthesisUtterance;

  const el = {
    voice: document.getElementById('voice'),
    rate: document.getElementById('rate'),
    rateVal: document.getElementById('rateVal'),
    voiceBadge: document.getElementById('voiceBadge'),
    progress: document.getElementById('progress'),
    elapsed: document.getElementById('elapsed'),
    duration: document.getElementById('duration'),
    heroDuration: document.getElementById('heroDuration'),
    progressLabel: document.getElementById('progressLabel'),
    nowText: document.getElementById('nowText'),
    playPause: document.getElementById('playPause'),
    heroPlay: document.getElementById('heroPlay'),
    rewind: document.getElementById('rewind'),
    forward: document.getElementById('forward'),
    restart: document.getElementById('restart'),
    transcript: document.getElementById('transcript'),
    followToggle: document.getElementById('followToggle'),
    chapters: document.getElementById('chapters'),
    shareBtn: document.getElementById('shareBtn'),
    voiceQuick: document.getElementById('voiceQuick'),
    toast: document.getElementById('toast')
  };

  const state = {
    voices: [],
    segments: [],
    segmentEls: [],
    currentIndex: 0,
    currentWordOffset: 0,
    isPlaying: false,
    isPaused: false,
    generation: 0,
    follow: true,
    seeking: false,
    lastWordMarkIndex: -1,
    startedAt: 0,
    watchdog: null,
    retryCount: 0,
    voicesReady: false
  };

  const CHAPTER_DEFS = [
    ['Introducción', 'Hola. Bienvenido al módulo cuatro'],
    ['Mitos frecuentes', 'Empecemos por los mitos'],
    ['Riesgos y sesgos', 'Ahora avancemos hacia los riesgos'],
    ['Caso Amazon', 'Para entender por qué la supervisión importa'],
    ['Supervisión y criterio', 'Pasemos ahora a una pregunta central'],
    ['Responsabilidad organizacional', 'La tercera dimensión es la responsabilidad organizacional'],
    ['Principios éticos', 'Llegamos a los principios básicos'],
    ['Síntesis final', 'Podemos cerrar M4']
  ];

  const savedRate = Number(localStorage.getItem('m4.rate'));
  if (savedRate >= .78 && savedRate <= 1.18) el.rate.value = String(savedRate);

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.toast.classList.remove('show'), 2500);
  }

  function normalizeLang(lang = '') { return lang.toLowerCase().replace('_', '-'); }
  function countWords(text) { return (text.match(/\S+/g) || []).length; }

  function splitLongSentence(sentence, maxChars = 220) {
    const clean = sentence.trim();
    if (clean.length <= maxChars) return [clean];
    const pieces = [];
    let rest = clean;
    while (rest.length > maxChars) {
      const probe = rest.slice(0, maxChars + 1);
      let cut = Math.max(probe.lastIndexOf('; '), probe.lastIndexOf(': '), probe.lastIndexOf(', '), probe.lastIndexOf(' — '));
      if (cut < Math.floor(maxChars * .5)) cut = probe.lastIndexOf(' ');
      if (cut < 20) cut = maxChars;
      pieces.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) pieces.push(rest);
    return pieces;
  }

  function segmentScript(text) {
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const result = [];
    let absoluteWord = 0;
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const sentences = paragraph.match(/[^.!?]+[.!?]+(?:[”"']+)?|[^.!?]+$/g) || [paragraph];
      sentences.flatMap(s => splitLongSentence(s)).map(s => s.trim()).filter(Boolean).forEach(textPart => {
        const wordCount = Math.max(1, countWords(textPart));
        result.push({ text: textPart, paragraphIndex, wordCount, startWord: absoluteWord, endWord: absoluteWord + wordCount });
        absoluteWord += wordCount;
      });
    });
    return result;
  }

  state.segments = segmentScript(SCRIPT);
  const totalWords = state.segments.reduce((sum, s) => sum + s.wordCount, 0);

  function getRate() { return Number(el.rate.value) || .96; }
  function wordsPerSecond() { return (150 * getRate()) / 60; }
  function totalSeconds() { return totalWords / wordsPerSecond(); }
  function secondsForWords(words) { return words / wordsPerSecond(); }

  function formatTime(seconds) {
    const sec = Math.max(0, Math.round(seconds));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function absoluteWordPosition() {
    const seg = state.segments[state.currentIndex];
    if (!seg) return totalWords;
    return Math.min(totalWords, seg.startWord + Math.max(0, state.currentWordOffset));
  }

  function updateProgress(overrideWords = null) {
    const words = overrideWords == null ? absoluteWordPosition() : Math.max(0, Math.min(totalWords, overrideWords));
    const ratio = totalWords ? words / totalWords : 0;
    if (!state.seeking) el.progress.value = String(Math.round(ratio * 1000));
    el.elapsed.textContent = formatTime(secondsForWords(words));
    el.duration.textContent = formatTime(totalSeconds());
    el.heroDuration.textContent = `≈ ${Math.max(1, Math.round(totalSeconds() / 60))} min`;
    el.progressLabel.textContent = `${Math.round(ratio * 100)}%`;
    updateActiveChapter(words);
  }

  function renderTranscript() {
    el.transcript.innerHTML = '';
    state.segmentEls = [];
    let paragraphIndex = -1;
    let p = null;
    state.segments.forEach((segment, index) => {
      if (segment.paragraphIndex !== paragraphIndex) {
        paragraphIndex = segment.paragraphIndex;
        p = document.createElement('p');
        el.transcript.appendChild(p);
      } else {
        p.appendChild(document.createTextNode(' '));
      }
      const span = document.createElement('span');
      span.className = 'speech-segment';
      span.textContent = segment.text;
      span.dataset.index = String(index);
      span.tabIndex = 0;
      span.title = 'Reproducir desde aquí';
      span.addEventListener('click', () => seekToIndex(index, true));
      span.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seekToIndex(index, true); }
      });
      p.appendChild(span);
      state.segmentEls[index] = span;
    });
  }

  function chapterIndexFromPhrase(phrase) {
    const target = phrase.toLowerCase();
    const i = state.segments.findIndex(s => s.text.toLowerCase().includes(target));
    return i >= 0 ? i : 0;
  }

  const chapters = CHAPTER_DEFS.map(([name, phrase], i) => {
    const segmentIndex = chapterIndexFromPhrase(phrase);
    const startWord = state.segments[segmentIndex]?.startWord || 0;
    return { name, segmentIndex, startWord, number: i + 1 };
  });

  function renderChapters() {
    el.chapters.innerHTML = '';
    chapters.forEach(chapter => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chapter-btn';
      button.dataset.startWord = String(chapter.startWord);
      button.innerHTML = `<span class="chapter-number">${String(chapter.number).padStart(2, '0')}</span><span class="chapter-name">${chapter.name}</span><span class="chapter-time">${formatTime(secondsForWords(chapter.startWord))}</span>`;
      button.addEventListener('click', () => seekToWord(chapter.startWord, true));
      el.chapters.appendChild(button);
    });
  }

  function updateActiveChapter(words = absoluteWordPosition()) {
    let active = 0;
    chapters.forEach((ch, i) => { if (words >= ch.startWord) active = i; });
    [...el.chapters.children].forEach((node, i) => node.classList.toggle('active', i === active));
  }

  function restoreSegment(index) {
    const node = state.segmentEls[index];
    const seg = state.segments[index];
    if (node && seg && node.textContent !== seg.text) node.textContent = seg.text;
  }

  function setCurrentSegment(index) {
    state.currentIndex = Math.max(0, Math.min(index, state.segments.length - 1));
    state.currentWordOffset = 0;
    state.lastWordMarkIndex = -1;
    state.segmentEls.forEach((node, i) => {
      if (i !== state.currentIndex) restoreSegment(i);
      node.classList.toggle('current', i === state.currentIndex);
      node.classList.toggle('past', i < state.currentIndex);
    });
    const currentNode = state.segmentEls[state.currentIndex];
    const segment = state.segments[state.currentIndex];
    if (segment) el.nowText.textContent = segment.text;
    if (state.follow && currentNode) currentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateProgress();
  }

  function markCurrentWord(charIndex) {
    const segment = state.segments[state.currentIndex];
    const node = state.segmentEls[state.currentIndex];
    if (!segment || !node) return;
    const words = [...segment.text.matchAll(/\S+/g)];
    if (!words.length) return;
    let wordIndex = words.findIndex((match, i) => {
      const start = match.index || 0;
      const next = i + 1 < words.length ? (words[i + 1].index || segment.text.length) : segment.text.length + 1;
      return charIndex >= start && charIndex < next;
    });
    if (wordIndex < 0) wordIndex = Math.max(0, Math.min(words.length - 1, state.lastWordMarkIndex + 1));
    if (wordIndex === state.lastWordMarkIndex) return;
    state.lastWordMarkIndex = wordIndex;
    state.currentWordOffset = wordIndex;

    const match = words[wordIndex];
    const start = match.index || 0;
    const end = start + match[0].length;
    node.textContent = '';
    node.append(document.createTextNode(segment.text.slice(0, start)));
    const mark = document.createElement('mark');
    mark.className = 'speech-word';
    mark.textContent = segment.text.slice(start, end);
    node.append(mark, document.createTextNode(segment.text.slice(end)));
    updateProgress();
  }

  function updatePlayerState() {
    const playing = state.isPlaying && !state.isPaused;
    el.heroPlay.classList.toggle('is-playing', playing);
    el.playPause.classList.toggle('is-playing', playing);
    el.heroPlay.setAttribute('aria-label', playing ? 'Pausar clase' : 'Reproducir clase');
    el.playPause.setAttribute('aria-label', playing ? 'Pausar' : (state.isPaused ? 'Continuar' : 'Reproducir'));
  }

  function selectedVoice() {
    return state.voices[Number(el.voice.value)] || null;
  }

  function voiceScore(voice) {
    const lang = normalizeLang(voice.lang);
    const name = (voice.name || '').toLowerCase();
    let score = 100;
    if (lang === 'es-ar') score -= 70;
    else if (lang.startsWith('es-')) score -= 40;
    if (/argentina|argentino|rioplat|latam|latin/.test(name)) score -= 18;
    if (/natural|neural|online|premium/.test(name)) score -= 10;
    if (voice.localService) score -= 2;
    return score;
  }

  function populateVoices() {
    if (!synth) return;
    const all = synth.getVoices() || [];
    const spanish = all.filter(v => /^es(?:-|_)/i.test(v.lang));
    state.voices = (spanish.length ? spanish : all).slice().sort((a, b) => voiceScore(a) - voiceScore(b) || a.name.localeCompare(b.name));
    const previousName = localStorage.getItem('m4.voice');
    el.voice.innerHTML = '';
    state.voices.forEach((voice, i) => {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = `${voice.name} · ${voice.lang || 'sin idioma'}`;
      el.voice.appendChild(option);
    });
    let preferred = state.voices.findIndex(v => v.name === previousName);
    if (preferred < 0) preferred = 0;
    if (state.voices.length) el.voice.value = String(preferred);
    state.voicesReady = state.voices.length > 0;
    updateVoiceBadge();
  }

  function updateVoiceBadge(message = '') {
    el.voiceBadge.className = 'status-pill';
    if (!synth || !Utterance) {
      el.voiceBadge.textContent = 'Audio no compatible con este navegador';
      el.voiceBadge.classList.add('warn');
      return;
    }
    const voice = selectedVoice();
    if (message) {
      el.voiceBadge.textContent = message;
      el.voiceBadge.classList.add('warn');
    } else if (voice) {
      const ar = normalizeLang(voice.lang) === 'es-ar';
      el.voiceBadge.textContent = ar ? `Voz argentina · ${voice.name}` : `Voz disponible · ${voice.name}`;
      el.voiceBadge.classList.add('ok');
    } else {
      el.voiceBadge.textContent = 'Voz del dispositivo';
      el.voiceBadge.classList.add('ok');
    }
  }

  function loadVoicesUntilReady() {
    if (!synth) return;
    populateVoices();
    if (state.voices.length) return;
    let tries = 0;
    const timer = setInterval(() => {
      populateVoices();
      tries += 1;
      if (state.voices.length || tries >= 20) clearInterval(timer);
    }, 150);
  }

  function clearWatchdog() {
    if (state.watchdog) clearTimeout(state.watchdog);
    state.watchdog = null;
  }

  function speakCurrent(generation, forceDefaultVoice = false) {
    if (!synth || !Utterance || !state.isPlaying || generation !== state.generation) return;
    if (state.currentIndex >= state.segments.length) {
      state.isPlaying = false;
      state.isPaused = false;
      updatePlayerState();
      el.nowText.textContent = 'Clase finalizada';
      updateProgress(totalWords);
      return;
    }

    const segment = state.segments[state.currentIndex];
    setCurrentSegment(state.currentIndex);
    const utterance = new Utterance(segment.text);
    const voice = forceDefaultVoice ? null : selectedVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'es-AR';
    utterance.rate = getRate();
    utterance.pitch = 1;
    utterance.volume = 1;

    let didStart = false;
    utterance.onstart = () => {
      if (generation !== state.generation) return;
      didStart = true;
      state.retryCount = 0;
      state.startedAt = performance.now();
      clearWatchdog();
      updateVoiceBadge();
    };

    utterance.onboundary = event => {
      if (generation !== state.generation) return;
      if (typeof event.charIndex === 'number') markCurrentWord(event.charIndex);
    };

    utterance.onend = () => {
      if (generation !== state.generation || !state.isPlaying) return;
      clearWatchdog();
      restoreSegment(state.currentIndex);
      state.currentIndex += 1;
      state.currentWordOffset = 0;
      state.lastWordMarkIndex = -1;
      window.setTimeout(() => speakCurrent(generation), 25);
    };

    utterance.onerror = event => {
      if (generation !== state.generation) return;
      if (['canceled', 'interrupted'].includes(event.error)) return;
      clearWatchdog();
      if (state.retryCount < 1) {
        state.retryCount += 1;
        updateVoiceBadge('Reintentando audio…');
        window.setTimeout(() => speakCurrent(generation, true), 140);
        return;
      }
      state.isPlaying = false;
      state.isPaused = false;
      updatePlayerState();
      updateVoiceBadge(`No se pudo iniciar la voz (${event.error || 'error'})`);
      showToast('No se pudo iniciar la voz. Probá otra voz o recargá el motor desde el ícono de parlante.');
    };

    try {
      synth.speak(utterance);
      clearWatchdog();
      state.watchdog = window.setTimeout(() => {
        if (generation !== state.generation || didStart || !state.isPlaying) return;
        if (state.retryCount < 1) {
          state.retryCount += 1;
          synth.cancel();
          updateVoiceBadge('Reintentando audio…');
          window.setTimeout(() => speakCurrent(generation, true), 180);
        } else {
          state.isPlaying = false;
          updatePlayerState();
          updateVoiceBadge('El navegador bloqueó la voz');
          showToast('El navegador no inició la voz. Elegí otra voz y tocá Reproducir nuevamente.');
        }
      }, 2200);
    } catch (error) {
      state.isPlaying = false;
      updatePlayerState();
      updateVoiceBadge('Error al iniciar el audio');
      showToast('Este navegador no pudo iniciar la síntesis de voz.');
    }
  }

  function startFromCurrent({ afterCancel = false } = {}) {
    if (!synth || !Utterance || !state.segments.length) {
      showToast('Tu navegador no admite síntesis de voz. Abrilo con Chrome, Edge o Safari actualizado.');
      return;
    }
    loadVoicesUntilReady();
    clearWatchdog();
    state.generation += 1;
    const generation = state.generation;
    state.isPlaying = true;
    state.isPaused = false;
    state.retryCount = 0;
    updatePlayerState();

    const needsCancel = afterCancel || synth.speaking || synth.pending || synth.paused;
    if (needsCancel) {
      synth.cancel();
      window.setTimeout(() => speakCurrent(generation), 120);
    } else {
      // Primer clic: hablar en el mismo gesto del usuario mejora compatibilidad móvil.
      speakCurrent(generation);
    }
  }

  function togglePlayPause() {
    if (!synth || !Utterance) {
      showToast('La síntesis de voz no está disponible en este navegador.');
      return;
    }
    if (!state.isPlaying) {
      if (state.currentIndex >= state.segments.length - 1 && Number(el.progress.value) >= 998) state.currentIndex = 0;
      startFromCurrent();
      return;
    }
    if (state.isPaused) {
      try { synth.resume(); } catch (_) {}
      state.isPaused = false;
    } else {
      try { synth.pause(); } catch (_) {}
      state.isPaused = true;
    }
    updatePlayerState();
  }

  function indexForWord(wordPosition) {
    const target = Math.max(0, Math.min(Math.max(0, totalWords - 1), wordPosition));
    let lo = 0, hi = state.segments.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const s = state.segments[mid];
      if (target < s.startWord) hi = mid - 1;
      else if (target >= s.endWord) lo = mid + 1;
      else return mid;
    }
    return Math.max(0, Math.min(lo, state.segments.length - 1));
  }

  function seekToWord(wordPosition, autoPlay = false) {
    if (!state.segments.length) return;
    const wasPlaying = state.isPlaying && !state.isPaused;
    state.generation += 1;
    clearWatchdog();
    if (synth && (synth.speaking || synth.pending || synth.paused)) synth.cancel();
    state.isPlaying = false;
    state.isPaused = false;
    state.retryCount = 0;
    const index = indexForWord(wordPosition);
    setCurrentSegment(index);
    updatePlayerState();
    if (autoPlay || wasPlaying) startFromCurrent({ afterCancel: true });
  }

  function seekToIndex(index, autoPlay = false) {
    const seg = state.segments[Math.max(0, Math.min(index, state.segments.length - 1))];
    if (seg) seekToWord(seg.startWord, autoPlay);
  }

  function seekBySeconds(seconds) {
    seekToWord(absoluteWordPosition() + seconds * wordsPerSecond(), state.isPlaying && !state.isPaused);
  }

  function reloadVoiceEngine() {
    if (!synth) return;
    state.generation += 1;
    state.isPlaying = false;
    state.isPaused = false;
    clearWatchdog();
    try { synth.cancel(); } catch (_) {}
    populateVoices();
    loadVoicesUntilReady();
    updatePlayerState();
    showToast('Motor de voz recargado. Tocá Reproducir.');
  }

  async function sharePage() {
    const data = { title: 'M4 - Mitos, riesgos y ética de la IA', text: 'Clase M4 - Mitos, riesgos y ética de la IA', url: location.href };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (_) {}
    }
    try {
      await navigator.clipboard.writeText(location.href);
      showToast('Link copiado al portapapeles');
    } catch (_) {
      showToast('Copiá el link desde la barra del navegador');
    }
  }

  renderTranscript();
  renderChapters();
  setCurrentSegment(0);
  updateProgress(0);
  el.rateVal.textContent = `${getRate().toFixed(2)}×`;

  if (synth) {
    loadVoicesUntilReady();
    synth.addEventListener?.('voiceschanged', populateVoices);
    if (!synth.addEventListener) synth.onvoiceschanged = populateVoices;
  } else {
    updateVoiceBadge();
  }

  el.playPause.addEventListener('click', togglePlayPause);
  el.heroPlay.addEventListener('click', togglePlayPause);
  el.rewind.addEventListener('click', () => seekBySeconds(-30));
  el.forward.addEventListener('click', () => seekBySeconds(30));
  el.restart.addEventListener('click', () => seekToWord(0, state.isPlaying && !state.isPaused));
  el.voiceQuick.addEventListener('click', reloadVoiceEngine);
  el.shareBtn.addEventListener('click', sharePage);

  el.progress.addEventListener('input', () => {
    state.seeking = true;
    updateProgress((Number(el.progress.value) / 1000) * totalWords);
  });
  el.progress.addEventListener('change', () => {
    const words = (Number(el.progress.value) / 1000) * totalWords;
    state.seeking = false;
    seekToWord(words, state.isPlaying && !state.isPaused);
  });
  el.progress.addEventListener('pointerup', () => {
    if (!state.seeking) return;
    const words = (Number(el.progress.value) / 1000) * totalWords;
    state.seeking = false;
    seekToWord(words, state.isPlaying && !state.isPaused);
  });

  el.voice.addEventListener('change', () => {
    const voice = selectedVoice();
    if (voice) localStorage.setItem('m4.voice', voice.name);
    updateVoiceBadge();
    if (state.isPlaying && !state.isPaused) startFromCurrent({ afterCancel: true });
  });

  el.rate.addEventListener('input', () => {
    el.rateVal.textContent = `${getRate().toFixed(2)}×`;
    updateProgress();
  });
  el.rate.addEventListener('change', () => {
    localStorage.setItem('m4.rate', el.rate.value);
    if (state.isPlaying && !state.isPaused) startFromCurrent({ afterCancel: true });
  });

  el.followToggle.addEventListener('click', () => {
    state.follow = !state.follow;
    el.followToggle.classList.toggle('active', state.follow);
    el.followToggle.setAttribute('aria-pressed', String(state.follow));
    el.followToggle.textContent = state.follow ? 'Seguir lectura' : 'Lectura libre';
  });

  window.addEventListener('beforeunload', () => {
    if (synth) synth.cancel();
  });
})();
