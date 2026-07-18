/* ============================================================
   MUSIC AO — dados de demonstração (mock)
   Artistas e faixas fictícios · valores ilustrativos
   ============================================================ */

const GENRES = [
  { id:'kuduro',    name:'Kuduro',       c1:'#E0122C', c2:'#7A0716' },
  { id:'semba',     name:'Semba',        c1:'#F2B01E', c2:'#8a5f05' },
  { id:'kizomba',   name:'Kizomba',      c1:'#B0186F', c2:'#4d0a30' },
  { id:'afrohouse', name:'Afrohouse',    c1:'#0FA3A3', c2:'#054a4a' },
  { id:'rap',       name:'Rap Angolano', c1:'#5A5AE6', c2:'#22224f' },
  { id:'gospel',    name:'Gospel',       c1:'#2E9E5B', c2:'#0f3d23' },
  { id:'zouk',      name:'Zouk',         c1:'#E66A2C', c2:'#6b2c0c' },
  { id:'amapiano',  name:'Amapiano',     c1:'#8A6FE8', c2:'#332561' },
];

const ARTISTS = [
  { id:'a1', name:'Kalunga MC',       province:'Luanda',   genre:'kuduro',    followers:184300, verified:true, socials:{facebook:'https://facebook.com/kalungamc',instagram:'https://instagram.com/kalungamc',youtube:'https://youtube.com/@kalungamc',tiktok:'https://tiktok.com/@kalungamc'} },
  { id:'a2', name:'Dona Rosa Semba',  province:'Benguela', genre:'semba',     followers:96100,  verified:true  },
  { id:'a3', name:'Txilar do Bié',    province:'Bié',      genre:'afrohouse', followers:61200,  verified:false },
  { id:'a4', name:'Mena Kiz',         province:'Luanda',   genre:'kizomba',   followers:220800, verified:true  },
  { id:'a5', name:'Prof. Verso',      province:'Huambo',   genre:'rap',       followers:47800,  verified:false },
  { id:'a6', name:'Coral Kimbanda',   province:'Uíge',     genre:'gospel',    followers:35400,  verified:false },
  { id:'a7', name:'DJ Maianga',       province:'Luanda',   genre:'amapiano',  followers:132600, verified:true  },
  { id:'a8', name:'Nzinga Soul',      province:'Cabinda',  genre:'zouk',      followers:58900,  verified:false },
];

/* paidTotal = AKZ já pagos ao artista por esta faixa (transparência) */
const TRACKS = [
  { id:'t1',  title:'Bassula Forte',        artistId:'a1', genre:'kuduro',    bpm:140, key:'A min', dur:198, plays:1240500, paidTotal:9924000,  year:2026 },
  { id:'t2',  title:'Zungueira do Meu Bairro', artistId:'a2', genre:'semba',  bpm:112, key:'D min', dur:243, plays:684200,  paidTotal:5473600,  year:2025 },
  { id:'t3',  title:'Madrugada em Luanda',  artistId:'a4', genre:'kizomba',   bpm:92,  key:'F# min',dur:262, plays:2013400, paidTotal:16107200, year:2026 },
  { id:'t4',  title:'Okuenda (Caminhar)',   artistId:'a3', genre:'afrohouse', bpm:122, key:'C min', dur:334, plays:512300,  paidTotal:4098400,  year:2026 },
  { id:'t5',  title:'Kandengue de Ouro',    artistId:'a5', genre:'rap',       bpm:96,  key:'G min', dur:221, plays:298700,  paidTotal:2389600,  year:2025 },
  { id:'t6',  title:'Aleluia na Banda',     artistId:'a6', genre:'gospel',    bpm:104, key:'E maj', dur:287, plays:176500,  paidTotal:1412000,  year:2026 },
  { id:'t7',  title:'Maianga às 3h',        artistId:'a7', genre:'amapiano',  bpm:113, key:'B min', dur:356, plays:934800,  paidTotal:7478400,  year:2026, ai:['Instrumentação'] },
  { id:'t8',  title:'Maré de Cabinda',      artistId:'a8', genre:'zouk',      bpm:98,  key:'A min', dur:249, plays:203900,  paidTotal:1631200,  year:2025 },
  { id:'t9',  title:'Toque de Recolher',    artistId:'a1', genre:'kuduro',    bpm:145, key:'E min', dur:187, plays:876400,  paidTotal:7011200,  year:2025 },
  { id:'t10', title:'Semba do Adeus',       artistId:'a2', genre:'semba',     bpm:108, key:'G min', dur:274, plays:451200,  paidTotal:3609600,  year:2024 },
  { id:'t11', title:'Teu Perfume',          artistId:'a4', genre:'kizomba',   bpm:88,  key:'C# min',dur:281, plays:1567800, paidTotal:12542400, year:2025 },
  { id:'t12', title:'Planalto Groove',      artistId:'a3', genre:'afrohouse', bpm:124, key:'D min', dur:312, plays:389100,  paidTotal:3112800,  year:2026 },
  { id:'t13', title:'Verso Livre',          artistId:'a5', genre:'rap',       bpm:90,  key:'F min', dur:204, plays:167300,  paidTotal:1338400,  year:2026 },
  { id:'t14', title:'Kuduro na Kianda',     artistId:'a7', genre:'amapiano',  bpm:112, key:'G# min',dur:329, plays:645200,  paidTotal:5161600,  year:2026, ai:['Voz','Masterização'] },
  { id:'t15', title:'Nzambi Connect',       artistId:'a6', genre:'gospel',    bpm:100, key:'A maj', dur:265, plays:98400,   paidTotal:787200,   year:2026 },
  { id:'t16', title:'Luanda Sunset',        artistId:'a8', genre:'zouk',      bpm:95,  key:'E min', dur:238, plays:312600,  paidTotal:2500800,  year:2026 },
];

const PROVINCES_TOP = [
  { name:'Luanda',   pct:100, streams:'4,2 M' },
  { name:'Benguela', pct:46,  streams:'1,9 M' },
  { name:'Huambo',   pct:34,  streams:'1,4 M' },
  { name:'Huíla',    pct:27,  streams:'1,1 M' },
  { name:'Cabinda',  pct:19,  streams:'812 k' },
  { name:'Diáspora', pct:41,  streams:'1,7 M' },
];

/* Receita mensal do artista demo (AKZ) — para o gráfico do dashboard */
const ARTIST_REVENUE_SERIES = [
  { m:'Ago', v:412000 }, { m:'Set', v:498000 }, { m:'Out', v:465000 },
  { m:'Nov', v:611000 }, { m:'Dez', v:834000 }, { m:'Jan', v:702000 },
  { m:'Fev', v:769000 }, { m:'Mar', v:918000 }, { m:'Abr', v:1054000 },
  { m:'Mai', v:1187000 }, { m:'Jun', v:1329000 }, { m:'Jul', v:864000 },
];

/* Contabilidade por artista para o Gerador de Pagamentos PSX.
   histPlays/histDownloads/histRevenue → contador HISTÓRICO (nunca reinicia).
   pendPlays/pendDownloads/pendValor    → contador FINANCEIRO (pendente de pagamento;
   zera após geração do PSX, mantendo o histórico). Valores em AKZ. */
const ARTIST_ACCOUNTS = [
  { artistId:'a1', iban:'AO06 0040 0000 1234 5678 9012 3', banco:'BIC', nif:'005412873LA041', titular:'João Baptista (Kalunga MC)',
    histPlays:3993400, histDownloads:159700, histRevenue:70000000, pendPlays:86400, pendDownloads:3200, pendValor:1184000 },
  { artistId:'a2', iban:'AO06 0004 0000 9876 5432 1098 7', banco:'BAI', nif:'007811234BE022', titular:'Rosa Domingos',
    histPlays:1135400, histDownloads:41200, histRevenue:15480000, pendPlays:34100, pendDownloads:1450, pendValor:486000 },
  { artistId:'a3', iban:'AO06 0055 0000 4455 6677 8899 0', banco:'BFA', nif:'004123987BI015', titular:'Amândio Chaves',
    histPlays:901400, histDownloads:28900, histRevenue:11200000, pendPlays:22800, pendDownloads:980, pendValor:326000 },
  { artistId:'a4', iban:'AO06 0006 0000 7788 9900 1122 3', banco:'BPC', nif:'009887654LA077', titular:'Maria Ndala',
    histPlays:3581200, histDownloads:143500, histRevenue:62800000, pendPlays:118600, pendDownloads:5100, pendValor:1696000 },
  { artistId:'a5', iban:'AO06 0040 0000 3344 5566 7788 9', banco:'BIC', nif:'003778812HU033', titular:'Paulo Verso',
    histPlays:466000, histDownloads:14200, histRevenue:6080000, pendPlays:16700, pendDownloads:620, pendValor:229000 },
  { artistId:'a7', iban:'AO06 0010 0000 2233 4455 6677 8', banco:'SOL', nif:'006554321LA088', titular:'Domingos Maianga',
    histPlays:1580000, histDownloads:58700, histRevenue:21600000, pendPlays:52400, pendDownloads:2280, pendValor:752000 },
];

const ADMIN_PENDING = [
  { id:'p1', title:'Bounce do Musseque', artist:'MC Kikolo',    genre:'Kuduro',   uploaded:'há 2 h'  },
  { id:'p2', title:'Saudade Materna',    artist:'Irmã Domingas',genre:'Gospel',   uploaded:'há 5 h'  },
  { id:'p3', title:'Noite no Ilhéu',     artist:'Banda Praiar', genre:'Zouk',     uploaded:'há 9 h'  },
  { id:'p4', title:'Cacimbo Flow',       artist:'Young Ndalu',  genre:'Rap',      uploaded:'há 1 dia'},
];

const ADMIN_FRAUD = [
  { id:'f1', type:'Play farm',       target:'conta u_88231', score:0.97, action:'bloqueada · 14.230 plays revertidos' },
  { id:'f2', type:'Multi-conta',     target:'cluster de 6 contas', score:0.91, action:'em revisão · payout retido' },
  { id:'f3', type:'Emulador',        target:'device fp_ax91', score:0.88, action:'dispositivo bloqueado' },
  { id:'f4', type:'VPN abusiva',     target:'ASN datacenter', score:0.74, action:'plays não faturáveis' },
];

const FOUNDER_LIMIT = 100;      // primeiros 100 artistas: inscrição grátis + Premium oferecido
const FOUNDER_COUNT = 10;       // já registados (10 gastas, 90 livres)

const AO = new Intl.NumberFormat('pt-PT');
const fmtKz = v => AO.format(Math.round(v)) + ' Kz';
const fmtN  = v => AO.format(v);
const fmtDur = s => Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
const artistOf = id => ARTISTS.find(a => a.id === id);
const genreOf  = id => GENRES.find(g => g.id === id);
const initials = name => name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
