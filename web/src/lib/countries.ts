// Países disponíveis no cadastro de loja (antes era texto livre, o que gerava
// grafias divergentes pro mesmo país). Brasil primeiro por ser o caso comum;
// o resto em ordem alfabética. Cobre os países cervejeiros relevantes — se
// faltar algum, é só acrescentar aqui.
//
// Atenção: esta lista é do país da LOJA. O país do PRODUTO vive em
// `attributes.pais` e continua vindo do scraper como texto (cada site escreve
// à sua maneira, ex. "Escócia, Reino Unido").
export const STORE_COUNTRIES = [
  "Brasil",
  "Alemanha",
  "Argentina",
  "Áustria",
  "Bélgica",
  "Canadá",
  "Chile",
  "China",
  "Dinamarca",
  "Escócia",
  "Espanha",
  "Estados Unidos",
  "França",
  "Holanda",
  "Inglaterra",
  "Irlanda",
  "Itália",
  "Japão",
  "México",
  "Noruega",
  "Nova Zelândia",
  "Polônia",
  "Portugal",
  "Reino Unido",
  "República Tcheca",
  "Suécia",
  "Suíça",
  "Uruguai",
];
