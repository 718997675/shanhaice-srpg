const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'assets', 'portraits');
fs.mkdirSync(OUT, { recursive: true });

const HEROES = {
  yunce: { seal: '策', role: '守脉人', tone: '#5f9389', robe: '#2f4f47', robe2: '#243c36', hair: 'topknot', hairColor: '#1e2420', skin: '#e6d2b4', eyes: 'calm', weapon: 'sword', accent: '#c8a45c', belt: '#8f6f3d' },
  yankui: { seal: '岩', role: '山岳卫', tone: '#8a6a43', robe: '#4a382a', robe2: '#382a20', hair: 'bald', hairColor: '#241d18', skin: '#d8b990', eyes: 'stern', weapon: 'axe', accent: '#b3864f', belt: '#5d452c', beard: true, broad: true },
  luming: { seal: '鹿', role: '灵枢医', tone: '#7f9a6c', robe: '#43573f', robe2: '#34452f', hair: 'bun', hairColor: '#26251f', skin: '#ecdcc0', eyes: 'gentle', weapon: 'staff', accent: '#a9c089', belt: '#6f7b4c' },
  qingluo: { seal: '青', role: '逐风射手', tone: '#b08a4c', robe: '#5b4a2c', robe2: '#463823', hair: 'ponytail', hairColor: '#2a241c', skin: '#e3c9a6', eyes: 'sharp', weapon: 'bow', accent: '#d2a95f', belt: '#7c5a30', feather: true },
  bailu: { seal: '鹭', role: '游龙骑将', tone: '#5c8397', robe: '#324c5a', robe2: '#263a45', hair: 'highponytail', hairColor: '#1d2529', skin: '#e7d3b6', eyes: 'bright', weapon: 'lance', accent: '#8bb6c9', belt: '#3f6272' },
  xuanyi: { seal: '漪', role: '冰璃咒师', tone: '#7d9db2', robe: '#374b5b', robe2: '#2a3a47', hair: 'long', hairColor: '#202b33', skin: '#eadbc8', eyes: 'cold', weapon: 'staff', accent: '#a9cde2', belt: '#4b6b80', hood: true, snow: true },
  moya: { seal: '鸦', role: '影刃', tone: '#7b5a5c', robe: '#2d2a2c', robe2: '#211f21', hair: 'hood', hairColor: '#1a1a1c', skin: '#d9c3aa', eyes: 'sharp', weapon: 'dagger', accent: '#a9453a', belt: '#3d3033', mask: true },
  chisang: { seal: '桑', role: '雷符真人', tone: '#b45b43', robe: '#5c2f26', robe2: '#44231d', hair: 'wild', hairColor: '#2b1c19', skin: '#dfc0a0', eyes: 'fierce', weapon: 'talisman', accent: '#d98c4a', belt: '#7b3c2b', lightning: true },
  aman: { seal: '蛮', role: '山灵御兽', tone: '#7e7a4c', robe: '#46452c', robe2: '#35341f', hair: 'fur', hairColor: '#2a2519', skin: '#cfb087', eyes: 'wild', weapon: 'claw', accent: '#b7a25c', belt: '#5a5230', beast: true },
  yunling: { seal: '翎', role: '天羽游侠', tone: '#7fa8ad', robe: '#3b5458', robe2: '#2c4145', hair: 'braid', hairColor: '#263034', skin: '#ecdbc2', eyes: 'bright', weapon: 'wings', accent: '#b8d5d2', belt: '#547177', feather: true }
};

const FOES = {
  shanxiao: { seal: '魈', role: '山魈王', tone: '#8a5c3b', robe: '#4a3426', robe2: '#38271d', hair: 'fur', hairColor: '#2c2119', skin: '#c9a678', eyes: 'beast', weapon: 'claw', accent: '#c08a4a', belt: '#5f432c', beast: true, horns: true, fangs: true },
  bamboo: { seal: '竹', role: '竹妖', tone: '#6f9160', robe: '#3d5138', robe2: '#2e3f2a', hair: 'long', hairColor: '#2a3b25', skin: '#c7d3ac', eyes: 'spirit', weapon: 'talisman', accent: '#a9c48c', belt: '#4d6243', plant: true },
  waterghost: { seal: '渡', role: '水鬼', tone: '#4f7f83', robe: '#2c4246', robe2: '#223437', hair: 'long', hairColor: '#1e3033', skin: '#a9c4c0', eyes: 'spirit', weapon: 'trident', accent: '#7fb6ba', belt: '#3c5c60', water: true },
  chisha: { seal: '砂', role: '赤砂将军', tone: '#a9453a', robe: '#5d2a25', robe2: '#45201c', hair: 'helm', hairColor: '#33231f', skin: '#d6b18b', eyes: 'stern', weapon: 'saber', accent: '#c8a45c', belt: '#7c3d31', armor: true },
  icexiao: { seal: '冰', role: '冰魈', tone: '#6f93a8', robe: '#314a58', robe2: '#263c47', hair: 'fur', hairColor: '#26343d', skin: '#bfd4dc', eyes: 'beast', weapon: 'claw', accent: '#a4c8d8', belt: '#40606f', beast: true, horns: true, snow: true },
  swampdragon: { seal: '沼', role: '沼龙', tone: '#5f7a4a', robe: '#33452a', robe2: '#27351f', hair: 'fur', hairColor: '#253020', skin: '#a9bb8a', eyes: 'beast', weapon: 'claw', accent: '#8fae6d', belt: '#435735', beast: true, horns: true, fangs: true },
  turbidgeneral: { seal: '浊', role: '浊将', tone: '#6d5a74', robe: '#332c3a', robe2: '#27212c', hair: 'helm', hairColor: '#241f28', skin: '#b9a6b4', eyes: 'void', weapon: 'lance', accent: '#9a7fa6', belt: '#453a4d', armor: true, mask: true },
  xuanque: { seal: '阙', role: '国师', tone: '#9a7b45', robe: '#332e26', robe2: '#26221c', hair: 'hood', hairColor: '#1f1c18', skin: '#d6c3a2', eyes: 'void', weapon: 'staff', accent: '#c8a45c', belt: '#4f4230', mask: true, gold: true }
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mesh(tone) {
  return `<path d="M-20 360 C60 320 100 350 150 330 C210 305 260 345 380 320 L380 500 L-20 500 Z" fill="${tone}" opacity=".10"/>` +
    `<path d="M-20 410 C70 380 130 402 190 386 C250 370 310 398 380 378 L380 500 L-20 500 Z" fill="${tone}" opacity=".08"/>`;
}

function halo(cfg) {
  return `<circle cx="180" cy="182" r="118" fill="none" stroke="${cfg.accent}" stroke-opacity=".22" stroke-width="1.2"/>` +
    `<circle cx="180" cy="182" r="96" fill="${cfg.tone}" opacity=".12"/>`;
}

function body(cfg) {
  const broad = cfg.broad ? 22 : 0;
  return `<path d="M${40 - broad} 480 C${48 - broad} 392 ${95 - broad} 340 150 322 L180 348 L210 322 C265 340 ${312 + broad} 392 ${320 + broad} 480 Z" fill="${cfg.robe}"/>` +
    `<path d="M150 322 L180 348 L210 322 L196 314 L180 330 L164 314 Z" fill="${cfg.robe2}"/>` +
    `<path d="M150 326 C160 370 168 410 176 480 L184 480 C192 410 200 370 210 326 L196 336 L180 390 L164 336 Z" fill="${cfg.robe2}"/>` +
    `<path d="M120 430 C150 418 210 418 240 430 L244 452 C210 438 150 438 116 452 Z" fill="${cfg.belt}" opacity=".9"/>` +
    `<circle cx="180" cy="438" r="7" fill="${cfg.accent}" opacity=".85"/>`;
}

function neckFace(cfg) {
  const skin = cfg.skin;
  return `<path d="M160 252 L160 300 C160 312 168 318 180 318 C192 318 200 312 200 300 L200 252 Z" fill="${skin}"/>` +
    `<path d="M158 286 C166 296 194 296 202 286 L202 304 C192 312 168 312 158 304 Z" fill="#000" opacity=".10"/>` +
    `<path d="M180 104 C226 104 252 136 252 184 C252 234 224 270 180 276 C136 270 108 234 108 184 C108 136 134 104 180 104 Z" fill="${skin}"/>` +
    `<path d="M112 176 C104 182 102 196 108 206 C112 212 118 212 120 208 L120 180 Z" fill="${skin}"/>` +
    `<path d="M248 176 C256 182 258 196 252 206 C248 212 242 212 240 208 L240 180 Z" fill="${skin}"/>`;
}

function features(cfg) {
  const ink = '#332b24';
  const styles = {
    calm: `<path d="M132 178 C142 172 156 172 166 177" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M194 177 C204 172 218 172 228 178" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M140 192 C148 188 158 188 164 192" stroke="${ink}" stroke-width="1.8" fill="none"/><path d="M196 192 C202 188 212 188 220 192" stroke="${ink}" stroke-width="1.8" fill="none"/><circle cx="152" cy="196" r="2.2" fill="${ink}"/><circle cx="208" cy="196" r="2.2" fill="${ink}"/><path d="M180 198 L176 216 L182 217" stroke="${ink}" stroke-width="1.6" fill="none"/><path d="M168 235 C176 239 184 239 192 235" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    stern: `<path d="M130 176 L166 182" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/><path d="M194 182 L230 176" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/><path d="M138 194 L164 192" stroke="${ink}" stroke-width="2" /><path d="M196 192 L222 194" stroke="${ink}" stroke-width="2"/><circle cx="152" cy="198" r="2.6" fill="${ink}"/><circle cx="208" cy="198" r="2.6" fill="${ink}"/><path d="M180 200 L175 218 L183 219" stroke="${ink}" stroke-width="1.8" fill="none"/><path d="M166 238 C176 242 186 241 194 236" stroke="${ink}" stroke-width="2.2" fill="none"/><path d="M158 256 C170 262 192 262 204 256" stroke="${ink}" stroke-width="2.4" fill="none" opacity=".55"/>`,
    gentle: `<path d="M134 180 C144 174 156 174 166 180" stroke="${ink}" stroke-width="2.2" fill="none"/><path d="M194 180 C204 174 216 174 226 180" stroke="${ink}" stroke-width="2.2" fill="none"/><path d="M140 194 C148 191 158 191 164 194" stroke="${ink}" stroke-width="1.6" fill="none"/><path d="M196 194 C202 191 212 191 220 194" stroke="${ink}" stroke-width="1.6" fill="none"/><circle cx="152" cy="198" r="1.9" fill="${ink}"/><circle cx="208" cy="198" r="1.9" fill="${ink}"/><path d="M180 200 L177 215" stroke="${ink}" stroke-width="1.4" fill="none"/><path d="M170 232 C178 237 184 237 191 232" stroke="${ink}" stroke-width="1.9" fill="none" stroke-linecap="round"/><circle cx="146" cy="212" r="4" fill="#b96a5c" opacity=".22"/><circle cx="214" cy="212" r="4" fill="#b96a5c" opacity=".22"/>`,
    sharp: `<path d="M132 177 C144 170 156 172 166 179" stroke="${ink}" stroke-width="2.6" fill="none"/><path d="M194 179 C204 172 216 170 228 177" stroke="${ink}" stroke-width="2.6" fill="none"/><path d="M140 194 C148 190 158 190 165 193" stroke="${ink}" stroke-width="1.7" fill="none"/><path d="M195 193 C202 190 212 190 220 194" stroke="${ink}" stroke-width="1.7" fill="none"/><circle cx="153" cy="197" r="2.3" fill="${ink}"/><circle cx="207" cy="197" r="2.3" fill="${ink}"/><path d="M180 199 L175 216 L182 217" stroke="${ink}" stroke-width="1.5" fill="none"/><path d="M170 234 C177 238 184 238 191 234" stroke="${ink}" stroke-width="1.9" fill="none"/>`,
    bright: `<path d="M134 179 C145 173 156 173 166 179" stroke="${ink}" stroke-width="2.3" fill="none"/><path d="M194 179 C204 173 215 173 226 179" stroke="${ink}" stroke-width="2.3" fill="none"/><path d="M141 192 C149 188 158 189 164 192" stroke="${ink}" stroke-width="1.8" fill="none"/><path d="M196 192 C202 189 211 188 219 192" stroke="${ink}" stroke-width="1.8" fill="none"/><circle cx="153" cy="196" r="2.4" fill="${ink}"/><circle cx="207" cy="196" r="2.4" fill="${ink}"/><path d="M180 199 L176 215" stroke="${ink}" stroke-width="1.4" fill="none"/><path d="M168 232 C176 238 184 238 192 232" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    cold: `<path d="M132 178 C144 175 156 175 166 178" stroke="${ink}" stroke-width="2" fill="none"/><path d="M194 178 C204 175 216 175 228 178" stroke="${ink}" stroke-width="2" fill="none"/><path d="M140 193 L164 193" stroke="${ink}" stroke-width="1.6"/><path d="M196 193 L220 193" stroke="${ink}" stroke-width="1.6"/><circle cx="152" cy="197" r="1.8" fill="#4f7b8f"/><circle cx="208" cy="197" r="1.8" fill="#4f7b8f"/><path d="M180 200 L178 215" stroke="${ink}" stroke-width="1.4" fill="none"/><path d="M171 233 C178 235 183 235 189 233" stroke="${ink}" stroke-width="1.7" fill="none"/><path d="M138 172 L158 168" stroke="#9fc6da" stroke-width="1" opacity=".6"/><path d="M202 168 L222 172" stroke="#9fc6da" stroke-width="1" opacity=".6"/>`,
    fierce: `<path d="M130 174 L166 184" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><path d="M194 184 L230 174" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><path d="M138 196 L164 191" stroke="${ink}" stroke-width="2.2"/><path d="M196 191 L222 196" stroke="${ink}" stroke-width="2.2"/><circle cx="152" cy="198" r="2.8" fill="${ink}"/><circle cx="208" cy="198" r="2.8" fill="${ink}"/><path d="M180 200 L174 219 L183 220" stroke="${ink}" stroke-width="1.8" fill="none"/><path d="M166 238 C176 244 188 243 196 236" stroke="${ink}" stroke-width="2.6" fill="none"/><path d="M160 258 C172 266 192 265 202 257" stroke="${ink}" stroke-width="2.6" fill="none" opacity=".5"/>`,
    wild: `<path d="M132 178 C144 170 156 172 166 180" stroke="${ink}" stroke-width="2.8" fill="none"/><path d="M194 180 C204 172 216 170 228 178" stroke="${ink}" stroke-width="2.8" fill="none"/><path d="M140 194 C148 190 158 190 165 193" stroke="${ink}" stroke-width="1.9"/><path d="M195 193 C202 190 212 190 220 194" stroke="${ink}" stroke-width="1.9"/><circle cx="153" cy="197" r="2.5" fill="${ink}"/><circle cx="207" cy="197" r="2.5" fill="${ink}"/><path d="M180 199 L175 217 L183 218" stroke="${ink}" stroke-width="1.6" fill="none"/><path d="M168 236 C177 241 186 240 194 235" stroke="${ink}" stroke-width="2.2" fill="none"/>`,
    beast: `<path d="M134 182 C145 175 156 176 166 182" stroke="${ink}" stroke-width="3" fill="none"/><path d="M194 182 C204 176 215 175 226 182" stroke="${ink}" stroke-width="3" fill="none"/><circle cx="152" cy="197" r="5" fill="#c8a45c"/><circle cx="208" cy="197" r="5" fill="#c8a45c"/><circle cx="152" cy="197" r="2.2" fill="#231a14"/><circle cx="208" cy="197" r="2.2" fill="#231a14"/><path d="M180 202 L172 219 L188 219 Z" fill="#3a2a20"/><path d="M166 238 C176 242 184 242 194 238" stroke="${ink}" stroke-width="2.4" fill="none"/>`,
    spirit: `<path d="M136 182 C146 178 156 178 166 182" stroke="${ink}" stroke-width="2" fill="none"/><path d="M194 182 C204 178 214 178 224 182" stroke="${ink}" stroke-width="2" fill="none"/><circle cx="153" cy="195" r="2.4" fill="#a9d3c7"/><circle cx="207" cy="195" r="2.4" fill="#a9d3c7"/><path d="M180 201 L178 216" stroke="${ink}" stroke-width="1.3" fill="none"/><path d="M172 232 C178 234 184 234 189 232" stroke="${ink}" stroke-width="1.6" fill="none"/>`,
    void: `<path d="M134 180 C146 176 156 176 166 180" stroke="${ink}" stroke-width="2" fill="none"/><path d="M194 180 C204 176 214 176 226 180" stroke="${ink}" stroke-width="2" fill="none"/><path d="M140 194 L164 194" stroke="#c8a45c" stroke-width="2"/><path d="M196 194 L220 194" stroke="#c8a45c" stroke-width="2"/><circle cx="152" cy="198" r="2" fill="#c8a45c"/><circle cx="208" cy="198" r="2" fill="#c8a45c"/><path d="M180 202 L177 216" stroke="${ink}" stroke-width="1.4" fill="none"/><path d="M170 234 C177 237 184 237 191 234" stroke="${ink}" stroke-width="1.8" fill="none"/>`
  };
  return styles[cfg.eyes] || styles.calm;
}

function hairBack(cfg) {
  if (cfg.hair === 'hood') return '';
  if (cfg.hair === 'bald') return '';
  if (cfg.hair === 'long') {
    return `<path d="M104 172 C96 238 102 300 118 336 C130 356 150 364 166 362 L160 286 C144 268 138 222 144 176 Z" fill="${cfg.hairColor}"/>` +
      `<path d="M256 172 C264 238 258 300 242 336 C230 356 210 364 194 362 L200 286 C216 268 222 222 216 176 Z" fill="${cfg.hairColor}"/>`;
  }
  if (cfg.hair === 'braid') {
    return `<path d="M112 178 C108 250 122 322 142 362 C154 384 170 390 178 388 L168 330 C150 300 144 240 148 180 Z" fill="${cfg.hairColor}"/>` +
      `<path d="M246 200 C264 250 268 320 256 372 C250 394 238 404 228 404 L232 340 C244 306 244 250 236 202 Z" fill="${cfg.hairColor}"/>`;
  }
  return `<path d="M106 182 C100 148 130 112 180 110 C230 112 260 148 254 182 C244 152 220 138 180 138 C140 138 116 152 106 182 Z" fill="${cfg.hairColor}"/>`;
}

function hairFront(cfg) {
  const c = cfg.hairColor;
  if (cfg.hair === 'topknot') {
    return `<path d="M114 178 C116 142 142 118 180 116 C218 118 244 142 246 178 C232 154 210 144 180 144 C150 144 128 154 114 178 Z" fill="${c}"/>` +
      `<path d="M164 120 C168 104 192 104 196 120 C196 132 186 140 180 140 C174 140 164 132 164 120 Z" fill="${c}"/>` +
      `<path d="M120 158 C150 140 210 140 240 158" stroke="${cfg.accent}" stroke-width="4" fill="none" opacity=".8"/>` +
      `<path d="M236 160 L268 178 L270 186 L240 176 Z" fill="${cfg.accent}" opacity=".85"/>`;
  }
  if (cfg.hair === 'bun') {
    return `<path d="M114 178 C116 144 142 120 180 118 C218 120 244 144 246 178 C232 156 210 146 180 146 C150 146 128 156 114 178 Z" fill="${c}"/>` +
      `<circle cx="180" cy="112" r="24" fill="${c}"/><circle cx="180" cy="112" r="14" fill="${cfg.robe2}"/>` +
      `<path d="M198 114 L238 96" stroke="${cfg.accent}" stroke-width="3.2" stroke-linecap="round"/><circle cx="240" cy="95" r="4" fill="${cfg.accent}"/>`;
  }
  if (cfg.hair === 'ponytail' || cfg.hair === 'highponytail') {
    const high = cfg.hair === 'highponytail';
    return `<path d="M114 178 C116 144 142 120 180 118 C218 120 244 144 246 178 C232 156 210 146 180 146 C150 146 128 156 114 178 Z" fill="${c}"/>` +
      `<path d="M${high ? 210 : 220} ${high ? 122 : 132} C266 ${high ? 104 : 138} 290 ${high ? 172 : 206} 272 ${high ? 236 : 266} C262 ${high ? 254 : 284} 250 ${high ? 262 : 292} 242 ${high ? 258 : 290} C252 ${high ? 224 : 248} 244 ${high ? 168 : 210} 214 ${high ? 140 : 156} Z" fill="${c}"/>` +
      `<path d="M144 160 C160 148 200 148 216 160" stroke="${cfg.accent}" stroke-width="3.4" fill="none" opacity=".7"/>`;
  }
  if (cfg.hair === 'hood') {
    return `<path d="M94 214 C96 140 132 88 180 88 C228 88 264 140 266 214 C250 178 222 158 180 158 C138 158 110 178 94 214 Z" fill="${cfg.robe2}"/>` +
      `<path d="M112 206 C118 152 144 118 180 116 C216 118 242 152 248 206 C232 170 210 154 180 154 C150 154 128 170 112 206 Z" fill="${cfg.robe}"/>` +
      `<path d="M98 210 C112 236 126 252 140 262 L128 292 C108 274 96 248 94 218 Z" fill="${cfg.robe2}"/>` +
      `<path d="M262 210 C248 236 234 252 220 262 L232 292 C252 274 264 248 266 218 Z" fill="${cfg.robe2}"/>`;
  }
  if (cfg.hair === 'wild') {
    return `<path d="M112 180 C108 152 120 128 138 116 L128 90 L154 110 L158 84 L176 108 L188 82 L200 110 L222 88 L226 116 L252 100 L244 132 C256 148 260 164 248 180 C234 154 212 144 180 144 C148 144 126 154 112 180 Z" fill="${c}"/>`;
  }
  if (cfg.hair === 'fur') {
    return `<path d="M96 196 C92 142 126 96 180 92 C234 96 268 142 264 196 L246 178 L238 198 L222 168 L210 190 L196 162 L180 186 L164 162 L150 190 L138 168 L122 198 L114 178 Z" fill="${c}"/>` +
      `<path d="M104 220 C112 200 126 190 140 188 L132 214 L118 232 Z" fill="${c}"/>` +
      `<path d="M256 220 C248 200 234 190 220 188 L228 214 L242 232 Z" fill="${c}"/>`;
  }
  if (cfg.hair === 'helm') {
    return `<path d="M104 186 C104 128 136 96 180 96 C224 96 256 128 256 186 L244 186 L240 160 L120 160 L116 186 Z" fill="${cfg.hairColor}"/>` +
      `<path d="M176 96 L180 60 L184 96 Z" fill="${cfg.accent}"/><circle cx="180" cy="86" r="7" fill="${cfg.accent}" opacity=".9"/>` +
      `<path d="M112 184 C140 168 220 168 248 184 L248 196 C220 180 140 180 112 196 Z" fill="${cfg.accent}" opacity=".7"/>`;
  }
  return '';
}

function extras(cfg) {
  let out = '';
  if (cfg.beard) {
    out += `<path d="M146 238 C154 258 168 272 180 274 C192 272 206 258 214 238 C208 262 196 280 180 284 C164 280 152 262 146 238 Z" fill="${cfg.hairColor}" opacity=".9"/>`;
  }
  if (cfg.mask) {
    out += `<path d="M118 186 C132 174 156 174 172 184 L172 224 C158 238 136 238 122 224 Z" fill="#20201f" opacity=".85"/>` +
      `<path d="M188 184 C204 174 228 174 242 186 L238 224 C224 238 202 238 188 224 Z" fill="#20201f" opacity=".62"/>` +
      `<path d="M120 198 L166 192" stroke="${cfg.accent}" stroke-width="1.4" opacity=".7"/><path d="M194 192 L240 198" stroke="${cfg.accent}" stroke-width="1.4" opacity=".7"/>`;
  }
  if (cfg.horns) {
    out += `<path d="M124 126 C104 104 98 84 104 66 C120 80 134 100 140 120 Z" fill="${cfg.accent}" opacity=".9"/>` +
      `<path d="M236 126 C256 104 262 84 256 66 C240 80 226 100 220 120 Z" fill="${cfg.accent}" opacity=".9"/>`;
  }
  if (cfg.fangs) {
    out += `<path d="M160 246 L166 262 L172 248 Z" fill="#f0e6d2"/><path d="M188 248 L194 262 L200 246 Z" fill="#f0e6d2"/>`;
  }
  if (cfg.feather) {
    out += `<path d="M236 138 C258 120 276 118 286 122 C274 132 260 142 244 148 Z" fill="${cfg.accent}" opacity=".85"/>` +
      `<path d="M238 150 C258 140 274 140 284 144 C272 152 258 158 246 160 Z" fill="${cfg.accent}" opacity=".55"/>`;
  }
  if (cfg.snow) {
    out += `<g stroke="#dceef4" stroke-width="1.2" opacity=".7"><path d="M72 92 L92 92 M82 82 L82 102 M75 85 L89 99 M89 85 L75 99"/><path d="M286 250 L302 250 M294 242 L294 258 M288 244 L300 256 M300 244 L288 256"/></g>`;
  }
  if (cfg.lightning) {
    out += `<path d="M268 84 L250 128 L264 128 L244 174 L276 122 L260 122 L282 84 Z" fill="${cfg.accent}" opacity=".55"/>`;
  }
  if (cfg.plant) {
    out += `<g stroke="${cfg.accent}" stroke-width="2.4" fill="none" opacity=".8"><path d="M84 320 C80 280 92 244 108 216"/><path d="M102 252 C86 240 78 226 78 210"/><path d="M98 268 C116 250 124 234 126 216"/></g>` +
      `<g fill="${cfg.accent}" opacity=".55"><path d="M78 210 C88 218 96 218 104 210 C96 200 86 200 78 210 Z"/><path d="M126 216 C134 226 144 228 152 222 C146 210 134 208 126 216 Z"/></g>`;
  }
  if (cfg.water) {
    out += `<g stroke="${cfg.accent}" stroke-width="1.4" fill="none" opacity=".55"><path d="M40 330 C80 322 104 338 140 330"/><path d="M220 330 C252 320 280 338 322 328"/><path d="M30 360 C74 350 110 368 150 358"/></g>`;
  }
  return out;
}

function weapon(cfg) {
  const a = cfg.accent;
  const ink = '#2c2a24';
  switch (cfg.weapon) {
    case 'sword':
      return `<g transform="rotate(12 292 300)"><rect x="286" y="164" width="9" height="204" rx="2" fill="#c9d3cd" stroke="${ink}" stroke-width="1.4"/><path d="M286 356 L295 356 L291 386 Z" fill="#8c9a92"/><rect x="266" y="348" width="48" height="8" rx="3" fill="${a}"/><rect x="286" y="360" width="9" height="42" rx="4" fill="${cfg.robe2}"/></g>`;
    case 'axe':
      return `<g transform="rotate(10 294 300)"><rect x="288" y="166" width="10" height="240" rx="3" fill="#6b5133"/><path d="M294 188 C330 180 348 202 348 226 C340 246 316 252 294 244 Z" fill="#9aa2a0" stroke="${ink}" stroke-width="1.6"/><path d="M294 250 C314 248 326 258 326 272 C318 284 304 288 294 282 Z" fill="#8b9492"/></g>`;
    case 'bow':
      return `<path d="M300 118 C350 174 350 294 300 362" stroke="#7a5a34" stroke-width="7" fill="none"/><path d="M300 118 C318 214 318 272 300 362" stroke="#d8c9aa" stroke-width="1.2" fill="none" opacity=".8"/><path d="M302 118 L302 362" stroke="#efe4cc" stroke-width="1" opacity=".55"/>`;
    case 'lance':
      return `<g transform="rotate(9 298 280)"><rect x="294" y="120" width="8" height="290" rx="3" fill="#7c5a38"/><path d="M298 84 L312 132 L298 148 L284 132 Z" fill="#c9d3cd" stroke="${ink}" stroke-width="1.4"/><rect x="286" y="150" width="24" height="7" fill="${a}"/></g>`;
    case 'staff':
      return `<g transform="rotate(7 298 300)"><rect x="294" y="158" width="8" height="246" rx="3" fill="#5b472f"/><circle cx="298" cy="140" r="20" fill="none" stroke="${a}" stroke-width="4"/><circle cx="298" cy="140" r="8" fill="${a}" opacity=".55"/></g>`;
    case 'dagger':
      return `<g transform="rotate(18 300 320)"><rect x="296" y="236" width="8" height="104" rx="2" fill="#c9d3cd" stroke="${ink}" stroke-width="1.2"/><path d="M296 340 L304 340 L300 368 Z" fill="#9aa5a0"/><rect x="282" y="334" width="36" height="7" rx="3" fill="${a}"/><rect x="296" y="342" width="8" height="34" rx="3" fill="${cfg.robe2}"/></g>`;
    case 'talisman':
      return `<g transform="rotate(8 300 300)"><rect x="290" y="180" width="6" height="220" fill="#5b472f"/><g fill="#e8dcc0" stroke="${cfg.accent}" stroke-width="1.2"><rect x="300" y="184" width="26" height="58" rx="2"/><rect x="316" y="214" width="24" height="52" rx="2"/><rect x="306" y="250" width="22" height="48" rx="2"/></g><g stroke="#9e3b32" stroke-width="1.4" opacity=".8"><path d="M308 200 L320 200 M314 192 L314 210 M310 246 L324 246 M317 238 L317 256 M312 272 L326 272"/></g></g>`;
    case 'claw':
      return `<g stroke="${a}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".9"><path d="M286 260 C318 240 334 202 332 170"/><path d="M300 272 C332 254 348 218 348 186"/><path d="M314 284 C344 270 358 240 360 210"/></g>`;
    case 'wings':
      return `<g fill="${a}" opacity=".35"><path d="M78 330 C34 286 24 220 40 158 C66 206 88 232 112 246 Z"/><path d="M282 330 C326 286 336 220 320 158 C294 206 272 232 248 246 Z"/></g>` +
        `<g stroke="${a}" stroke-width="1.4" opacity=".55" fill="none"><path d="M60 300 C42 254 42 210 54 176"/><path d="M76 316 C60 270 62 226 74 196"/><path d="M300 300 C318 254 318 210 306 176"/><path d="M284 316 C300 270 298 226 286 196"/></g>`;
    case 'trident':
      return `<g transform="rotate(8 300 290)"><rect x="296" y="150" width="8" height="250" rx="3" fill="#3f5b5e"/><path d="M300 96 L306 140 L300 158 L294 140 Z" fill="#bfd4d2"/><path d="M272 112 L278 150 L286 150 L282 112 Z" fill="#bfd4d2"/><path d="M328 112 L322 150 L314 150 L318 112 Z" fill="#bfd4d2"/><rect x="274" y="148" width="52" height="6" fill="${a}"/></g>`;
    case 'saber':
      return `<g transform="rotate(24 300 300)"><path d="M288 362 C316 300 338 236 344 168" stroke="#c9d3cd" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M286 350 L270 366 L282 372 Z" fill="${a}"/><rect x="280" y="356" width="8" height="42" rx="4" fill="${cfg.robe2}"/></g>`;
    default:
      return '';
  }
}

function seal(cfg) {
  return `<g opacity=".92"><rect x="26" y="26" width="34" height="52" rx="2" fill="#9e3b32"/><text x="43" y="62" text-anchor="middle" font-family="KaiTi, STKaiti, serif" font-size="24" fill="#f1e4ca">${esc(cfg.seal)}</text></g>` +
    `<text x="330" y="452" text-anchor="end" font-family="KaiTi, STKaiti, serif" font-size="15" fill="#3f3a2e" opacity=".55" writing-mode="vertical-rl">${esc(cfg.role)}</text>`;
}

function portrait(cfg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480">
<defs>
<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3d7bd"/><stop offset=".55" stop-color="#d6c6a6"/><stop offset="1" stop-color="#c3b08c"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="${cfg.tone}" stop-opacity=".30"/><stop offset="1" stop-color="${cfg.tone}" stop-opacity="0"/></radialGradient>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".12"/></feComponentTransfer></filter>
<clipPath id="frame"><rect width="360" height="480" rx="3"/></clipPath>
</defs>
<g clip-path="url(#frame)">
<rect width="360" height="480" fill="url(#paper)"/>
<circle cx="270" cy="106" r="54" fill="${cfg.accent}" opacity=".18"/>
<circle cx="270" cy="106" r="54" fill="none" stroke="${cfg.accent}" stroke-opacity=".25"/>
<path d="M-20 250 C40 210 80 236 120 214 C164 190 202 226 250 206 C292 188 330 210 380 190 L380 360 L-20 360 Z" fill="${cfg.tone}" opacity=".13"/>
<path d="M-20 300 C50 276 96 296 142 280 C196 260 236 292 286 274 C318 264 350 276 380 266 L380 400 L-20 400 Z" fill="${cfg.tone}" opacity=".10"/>
<rect width="360" height="480" fill="url(#glow)"/>
${mesh(cfg.tone)}
${halo(cfg)}
${body(cfg)}
${neckFace(cfg)}
${hairBack(cfg)}
${hairFront(cfg)}
${features(cfg)}
${extras(cfg)}
${weapon(cfg)}
<path d="M-10 474 C40 452 60 470 96 458 C132 446 160 470 198 456 C236 442 268 468 310 452 C334 444 356 452 372 448 L372 490 L-10 490 Z" fill="#2e3b32" opacity=".22"/>
<g stroke="#3b453a" stroke-width="1.4" fill="none" opacity=".35"><path d="M40 470 C46 440 42 416 34 396"/><path d="M52 472 C60 444 58 420 50 402"/><path d="M316 468 C322 440 318 418 310 400"/><path d="M328 470 C336 444 334 420 326 404"/></g>
<rect width="360" height="480" filter="url(#grain)" opacity=".55"/>
${seal(cfg)}
</g>
</svg>`;
  return svg;
}

function titleArt() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1512"/><stop offset=".55" stop-color="#15221c"/><stop offset="1" stop-color="#1d2e25"/></linearGradient>
<radialGradient id="moon" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f3e6c4" stop-opacity=".92"/><stop offset=".62" stop-color="#e8d7ae" stop-opacity=".38"/><stop offset="1" stop-color="#e8d7ae" stop-opacity="0"/></radialGradient>
<linearGradient id="river" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fa39a" stop-opacity=".08"/><stop offset=".5" stop-color="#c8a45c" stop-opacity=".30"/><stop offset="1" stop-color="#7fa39a" stop-opacity=".04"/></linearGradient>
<filter id="wash"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="18"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".18"/></feComponentTransfer></filter>
</defs>
<rect width="1200" height="720" fill="url(#sky)"/>
<circle cx="880" cy="196" r="150" fill="url(#moon)"/>
<circle cx="880" cy="196" r="86" fill="#f1e2bd" opacity=".55"/>
<g filter="url(#wash)" opacity=".9">
<path d="M0 430 C120 350 220 396 320 330 C410 270 480 340 580 300 C690 254 760 332 860 292 C960 252 1060 312 1200 264 L1200 720 L0 720 Z" fill="#0e1a15"/>
<path d="M0 500 C130 430 230 472 340 418 C430 374 520 432 620 396 C720 360 800 424 900 390 C1000 356 1100 410 1200 372 L1200 720 L0 720 Z" fill="#0a1310" opacity=".9"/>
<path d="M0 574 C140 520 260 556 380 512 C490 472 590 532 700 502 C820 470 940 520 1060 496 L1200 474 L1200 720 L0 720 Z" fill="#08100d"/>
</g>
<g opacity=".55" stroke="#8fb0a2" stroke-width="1.2" fill="none">
<path d="M0 356 C120 330 210 352 310 326"/><path d="M420 344 C520 316 610 340 700 318"/><path d="M760 330 C860 306 960 326 1060 306"/>
</g>
<path d="M700 720 C760 620 820 560 900 530 C810 566 760 632 740 720 Z" fill="url(#river)"/>
<g opacity=".8">
<path d="M928 720 L938 590 L948 720 Z" fill="#1b2a22"/>
<path d="M948 610 C922 574 900 556 876 544 C906 548 934 572 950 598 C966 566 994 546 1022 540 C998 556 976 582 958 612 Z" fill="#14211b"/>
<path d="M938 588 C918 566 894 556 868 552 C894 560 918 578 934 600 Z" fill="#14211b"/>
<path d="M946 584 C968 560 992 550 1018 546 C994 556 972 576 958 598 Z" fill="#14211b"/>
</g>
<g>
<path d="M806 588 C812 570 822 560 834 556 L838 584 L826 606 Z" fill="#0b1310"/>
<circle cx="828" cy="548" r="10" fill="#0b1310"/>
<path d="M828 560 C842 570 848 584 850 600 L838 606 L828 588 Z" fill="#0b1310"/>
<path d="M846 574 L916 520" stroke="#c8a45c" stroke-width="4" stroke-linecap="round"/>
<path d="M916 520 L928 508" stroke="#e6c47a" stroke-width="3" stroke-linecap="round"/>
</g>
<g fill="#0a1210" opacity=".85">
<path d="M150 720 L158 620 L168 720 Z"/><path d="M168 640 C148 612 132 598 112 590 C136 594 158 612 170 634 C184 608 206 592 228 588 C208 602 188 622 176 646 Z"/>
<path d="M320 720 L326 660 L334 720 Z"/><path d="M332 672 C316 650 302 640 286 634 C304 638 322 652 332 668 C342 648 358 636 374 632 C360 642 346 656 338 674 Z"/>
</g>
<g opacity=".35" stroke="#c8a45c" stroke-width="1.4" fill="none">
<path d="M0 452 C180 442 360 462 540 450 C740 436 940 460 1200 444"/>
<path d="M0 486 C200 474 380 496 580 482 C780 468 980 492 1200 476"/>
</g>
<rect width="1200" height="720" filter="url(#grain)" opacity=".5"/>
</svg>`;
}

const all = Object.assign({}, HEROES, FOES);
for (const [id, cfg] of Object.entries(all)) {
  fs.writeFileSync(path.join(OUT, id + '.svg'), portrait(cfg), 'utf8');
}
fs.writeFileSync(path.join(OUT, 'title.svg'), titleArt(), 'utf8');
console.log('generated ' + (Object.keys(all).length + 1) + ' svg assets in ' + OUT);
