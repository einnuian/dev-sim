# 🎧 Audio + Visual FX Integration

This guide explains how to integrate procedural audio and visual effects into your 2D simulation game.

---

## 📦 Files Included

Ensure these files are present in your project:

```
src/audio/synth.js     // Procedural sound effects (SFX)
src/audio/music.js     // Adaptive background music
src/audio/wire.js      // Integration layer (auto-wires everything)
src/fx/juice.js        // Visual effects (shake, particles, popups)
```

---

## 🚨 Required Setup (ONLY 2 LINES)

In your app entry file (e.g. `main.js`, `index.js`, `App.jsx`):

```js
import { wireAudioJuice } from './audio/wire.js';

wireAudioJuice();
// OR wireAudioJuice(store) if using a global store
```

---

## 🎮 What You Get Instantly

- ✅ Click sounds on all buttons
- ✅ Hover sounds on UI elements
- ✅ Background music (starts after first interaction)
- ✅ Press **M** to mute/unmute
- ✅ Screen shake + particles + popups

---

## ⚙️ System Breakdown

### 🎵 synth.js
- Generates all sound effects using Web Audio API
- No audio files required

### 🎶 music.js
- Adaptive chiptune music engine
- Responds to:
  - runwayMonths
  - morale
  - bankrupt state

### ✨ juice.js
Adds visual polish:
- Screen shake
- Flash overlays
- Floating text
- Particle bursts

### 🔌 wire.js
Auto-connects everything:
- DOM clicks + hover
- Keyboard input (M key)
- Optional store/event integration

---

## 🔗 Integration Modes

### 1. No State (Default)

```js
wireAudioJuice();
```

Works with DOM only.

---

### 2. Event Bus (Recommended)

```js
wireAudioJuice(store);
```

Example:

```js
store.events.emit('pr:merged', { x: 300, y: 200 });
```

---

### 3. Redux/Zustand Store

```js
wireAudioJuice(store);
```

Automatically reacts to state changes.

---

## 🎯 Optional Enhancements

### Custom Button Sounds

```html
<button data-sfx="hire">Hire</button>
<button data-sfx="fire">Fire</button>
<button data-sfx="prMerged">Merge PR</button>
```

---

### Manual Trigger (Precise Effects)

```js
import { sfx } from './audio/synth.js';
import { juice } from './fx/juice.js';

function handleMerge(e) {
  const r = e.currentTarget.getBoundingClientRect();

  sfx.prMerged();
  juice.cheer(r.left + r.width/2, r.top + r.height/2);
}
```

---

### Volume Control

```js
import { audio } from './audio/synth.js';

audio.setMasterVolume(0.5);
audio.toggleMute();
```

---

## 🎹 Controls

| Key | Action |
|-----|--------|
| M   | Toggle mute |

---

## ⚠️ Important Notes

- Audio starts only after user interaction (browser autoplay policy)
- Works on modern browsers
- No external dependencies required

---

## ✅ Final Checklist

- [ ] All 4 files added (synth.js, music.js, wire.js, juice.js)
- [ ] `wireAudioJuice()` added to entry file
- [ ] App runs without errors
- [ ] Click triggers sound
- [ ] Hover triggers sound
- [ ] Background music starts after first interaction
- [ ] Press **M** toggles mute

---

## 🚀 Done

Your game now includes:

- 🎵 Procedural sound effects
- 🎶 Adaptive background music
- ✨ Visual feedback system (juice)

---

## 💡 Future Improvements (Optional)

- CRT/glitch visual effects
- Day/night cycle tied to game state
- Sound-reactive UI animations
- Crisis/boss mode music

---

## 🏁 Quick Test

1. Run your app
2. Click anywhere → music starts
3. Click buttons → hear SFX
4. Press **M** → mute/unmute

✔️ If all work → integration successful

