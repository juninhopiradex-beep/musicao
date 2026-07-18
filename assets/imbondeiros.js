/* =====================================================================
   MUSIC AO · Imbondeiros musicais (fundos vetoriais)
   Três variações do imbondeiro — símbolo de Angola — reinterpretado
   com elementos musicais. SVG puro: escala em qualquer ecrã e pesa
   poucos KB (importante para ligações lentas e dados caros).
   ===================================================================== */

const IMBONDEIROS = {

  /* --- A · SONORO: ramos e copa desenhados como ondas sonoras --- */
  sonoro: `<svg viewBox="0 0 600 620" xmlns="http://www.w3.org/2000/svg" fill="none">
    <defs>
      <linearGradient id="tA" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#B8860B" stop-opacity=".85"/>
        <stop offset="1" stop-color="#F2B01E" stop-opacity=".5"/>
      </linearGradient>
    </defs>
    <!-- tronco largo caracteristico do imbondeiro -->
    <path d="M250 560 C266 470 276 400 280 330 L320 330 C324 400 334 470 350 560 Z" fill="url(#tA)"/>
    <!-- raizes -->
    <path d="M250 560 C228 552 206 556 188 568 M350 560 C372 552 394 556 412 568" stroke="#B8860B" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>
    <!-- ramos como ondas sonoras a irradiar -->
    <g stroke="#F2B01E" stroke-opacity=".7" stroke-width="4" stroke-linecap="round">
      <path d="M285 330 C255 305 235 315 210 292 C190 274 168 284 146 266"/>
      <path d="M292 328 C272 290 250 282 232 246 C218 218 196 212 178 184"/>
      <path d="M300 326 C296 282 286 258 284 214 C282 180 292 158 290 128"/>
      <path d="M308 328 C328 290 350 282 368 246 C382 218 404 212 422 184"/>
      <path d="M315 330 C345 305 365 315 390 292 C410 274 432 284 454 266"/>
    </g>
    <!-- ondas concentricas: a copa e som -->
    <g stroke="#F2B01E" stroke-linecap="round" fill="none">
      <path d="M120 214 Q300 118 480 214" stroke-opacity=".42" stroke-width="4"/>
      <path d="M92 250 Q300 132 508 250" stroke-opacity=".28" stroke-width="3.5"/>
      <path d="M66 288 Q300 148 534 288" stroke-opacity=".16" stroke-width="3"/>
    </g>
    <!-- pontos de energia nas pontas dos ramos -->
    <g fill="#F2B01E" fill-opacity=".8">
      <circle cx="146" cy="266" r="6"/><circle cx="178" cy="184" r="6"/>
      <circle cx="290" cy="128" r="7"/>
      <circle cx="422" cy="184" r="6"/><circle cx="454" cy="266" r="6"/>
    </g>
  </svg>`,

  /* --- B · NOTAS: copa formada por notas musicais --- */
  notas: `<svg viewBox="0 0 600 620" xmlns="http://www.w3.org/2000/svg" fill="none">
    <defs>
      <linearGradient id="tB" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#8B1A1A" stop-opacity=".8"/>
        <stop offset="1" stop-color="#B8860B" stop-opacity=".55"/>
      </linearGradient>
    </defs>
    <!-- tronco -->
    <path d="M252 560 C268 468 278 398 282 326 L318 326 C322 398 332 468 348 560 Z" fill="url(#tB)"/>
    <path d="M252 560 C230 552 208 556 190 568 M348 560 C370 552 392 556 410 568" stroke="#B8860B" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
    <!-- ramos organicos -->
    <g stroke="#B8860B" stroke-opacity=".62" stroke-width="5" stroke-linecap="round">
      <path d="M286 326 C250 300 226 306 196 282"/>
      <path d="M293 324 C268 286 244 276 222 240"/>
      <path d="M300 322 C298 278 292 252 292 214"/>
      <path d="M307 324 C332 286 356 276 378 240"/>
      <path d="M314 326 C350 300 374 306 404 282"/>
      <path d="M290 300 C262 268 236 262 214 232" stroke-opacity=".4" stroke-width="3.5"/>
      <path d="M310 300 C338 268 364 262 386 232" stroke-opacity=".4" stroke-width="3.5"/>
    </g>
    <!-- notas musicais como folhas -->
    <g fill="#F2B01E" fill-opacity=".78">
      <!-- nota simples (cabeca + haste) -->
      <g transform="translate(186,272) scale(1.05)">
        <ellipse cx="0" cy="10" rx="9" ry="6.5" transform="rotate(-20)"/>
        <rect x="7" y="-16" width="3.2" height="26" rx="1.6"/>
      </g>
      <g transform="translate(212,226) scale(1.15)">
        <ellipse cx="0" cy="10" rx="9" ry="6.5" transform="rotate(-20)"/>
        <rect x="7" y="-18" width="3.2" height="28" rx="1.6"/>
        <path d="M10 -18 C22 -12 22 -2 14 4" stroke="#F2B01E" stroke-opacity=".78" stroke-width="3" fill="none"/>
      </g>
      <g transform="translate(288,196) scale(1.3)">
        <ellipse cx="0" cy="10" rx="9" ry="6.5" transform="rotate(-20)"/>
        <rect x="7" y="-20" width="3.4" height="30" rx="1.7"/>
        <path d="M10 -20 C24 -13 24 -1 15 6" stroke="#F2B01E" stroke-opacity=".78" stroke-width="3.2" fill="none"/>
      </g>
      <g transform="translate(372,226) scale(1.15)">
        <ellipse cx="0" cy="10" rx="9" ry="6.5" transform="rotate(-20)"/>
        <rect x="7" y="-18" width="3.2" height="28" rx="1.6"/>
      </g>
      <g transform="translate(400,272) scale(1.05)">
        <ellipse cx="0" cy="10" rx="9" ry="6.5" transform="rotate(-20)"/>
        <rect x="7" y="-16" width="3.2" height="26" rx="1.6"/>
        <path d="M10 -16 C21 -10 21 -1 13 4" stroke="#F2B01E" stroke-opacity=".78" stroke-width="2.8" fill="none"/>
      </g>
      <!-- notas menores dispersas -->
      <g transform="translate(206,214) scale(.72)" fill-opacity=".5">
        <ellipse cx="0" cy="10" rx="9" ry="6.5" transform="rotate(-20)"/><rect x="7" y="-14" width="3" height="24" rx="1.5"/>
      </g>
      <g transform="translate(384,208) scale(.72)" fill-opacity=".5">
        <ellipse cx="0" cy="10" rx="9" ry="6.5" transform="rotate(-20)"/><rect x="7" y="-14" width="3" height="24" rx="1.5"/>
      </g>
    </g>
  </svg>`,

  /* --- C · EQUALIZADOR: copa em barras de espectro sonoro --- */
  equalizador: `<svg viewBox="0 0 600 620" xmlns="http://www.w3.org/2000/svg" fill="none">
    <defs>
      <linearGradient id="tC" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#B8860B" stop-opacity=".8"/>
        <stop offset="1" stop-color="#E0122C" stop-opacity=".45"/>
      </linearGradient>
      <linearGradient id="bC" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#E0122C" stop-opacity=".62"/>
        <stop offset="1" stop-color="#F2B01E" stop-opacity=".82"/>
      </linearGradient>
    </defs>
    <!-- tronco -->
    <path d="M254 560 C270 472 280 404 284 336 L316 336 C320 404 330 472 346 560 Z" fill="url(#tC)"/>
    <path d="M254 560 C232 552 210 556 192 568 M346 560 C368 552 390 556 408 568" stroke="#B8860B" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
    <!-- ramos curtos que abrem para o equalizador -->
    <g stroke="#B8860B" stroke-opacity=".55" stroke-width="4.5" stroke-linecap="round">
      <path d="M288 336 C262 322 234 320 208 314"/>
      <path d="M296 334 C284 318 272 308 258 296"/>
      <path d="M304 334 C316 318 328 308 342 296"/>
      <path d="M312 336 C338 322 366 320 392 314"/>
    </g>
    <!-- barras de equalizador: a copa e um espectro -->
    <g fill="url(#bC)">
      <rect x="150" y="272" width="17" height="46" rx="8.5"/>
      <rect x="177" y="242" width="17" height="76" rx="8.5"/>
      <rect x="204" y="196" width="17" height="122" rx="8.5"/>
      <rect x="231" y="228" width="17" height="90" rx="8.5"/>
      <rect x="258" y="160" width="17" height="158" rx="8.5"/>
      <rect x="285" y="118" width="17" height="200" rx="8.5"/>
      <rect x="312" y="152" width="17" height="166" rx="8.5"/>
      <rect x="339" y="206" width="17" height="112" rx="8.5"/>
      <rect x="366" y="176" width="17" height="142" rx="8.5"/>
      <rect x="393" y="236" width="17" height="82" rx="8.5"/>
      <rect x="420" y="266" width="17" height="52" rx="8.5"/>
    </g>
    <!-- linha de base do espectro -->
    <path d="M140 322 L447 322" stroke="#F2B01E" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
};

/* Aplica um dos fundos ao elemento indicado (por omissão, o fundo global da app).
   opacidade recomendada: .05–.10 no fundo da página; .5–.8 no leitor em ecrã inteiro. */
function aplicarImbondeiro(nome, alvo, opacidade){
  const svg = IMBONDEIROS[nome];
  if(!svg) return false;
  const el = typeof alvo === 'string' ? document.querySelector(alvo) : alvo;
  if(!el) return false;
  const uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
  el.style.backgroundImage = 'url("' + uri + '")';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundPosition = 'center 20%';
  el.style.backgroundSize = 'min(760px, 78%) auto';
  if(opacidade != null) el.style.opacity = opacidade;
  return true;
}
