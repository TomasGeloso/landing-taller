/*
  SECCIONES DE LA PÁGINA
  ----------------------
  Este archivo lo edita la página admin.html (pestaña "Secciones de la página"
  y "Imágenes"). No hace falta tocarlo a mano.

  destacados    trabajos grandes al principio de la galería (ids de trabajos)
  antesDespues  comparador de antes y después (ids de trabajos con fotos de antes y después)
  proceso       pasos del mecanizado: t título, d descripción, f foto
  mosaicos      fotos chicas de las secciones Soldaduras y Moldes
  clientes      logos de "Trabajamos para": c sigla, n nombre, img logo, h alto en px
*/
window.CONTENIDO = {
  "destacados": [
    "molino-de-laboratorio",
    "horno-de-laboratorio",
    "tamizadora-de-laboratorio"
  ],
  "antesDespues": [
    "agitador-de-tamices-tipo-armario",
    "tamizadora-de-laboratorio",
    "durometro",
    "elevador-manual"
  ],
  "proceso": [
    {
      "t": "Corte",
      "d": "A medida, desde barra, caño o chapa",
      "f": "img/trabajos/taller/sierra-de-corte-2.jpg"
    },
    {
      "t": "Torneado",
      "d": "Ejes, bujes, roscas y probetas",
      "f": "img/trabajos/taller/probeta-en-el-torno.jpg"
    },
    {
      "t": "Fresado",
      "d": "Caras, ranuras y alojamientos",
      "f": "img/trabajos/taller/probeta-montada-en-el-plato.jpg"
    },
    {
      "t": "Pieza terminada",
      "d": "Control dimensional antes de entregar",
      "f": "img/trabajos/dispositivos/dispositivos-mecanizados-2.jpg"
    }
  ],
  "mosaicos": {
    "soldadura": [
      "img/trabajos/dispositivos/gradillas-de-acero-inoxidable.jpg",
      "img/trabajos/estructuras/racks-de-chapa.jpg",
      "img/trabajos/estructuras/carro-de-acero-inoxidable.jpg"
    ],
    "moldes": [
      "img/trabajos/moldes/molde-para-ladrillo-refractario-con-alojamiento-para-resistencia-2.jpg",
      "img/trabajos/moldes/molde-para-lingotes-refractarios-1.jpg",
      "img/trabajos/moldes/molde-para-bloque-refractario.jpg"
    ]
  },
  "clientes": [
    {
      "c": "UTN",
      "n": "Universidad Tecnológica Nacional",
      "img": "img/clientes/utn.png",
      "h": 50
    },
    {
      "c": "IAS",
      "n": "Instituto Argentino de Siderurgia",
      "img": "img/clientes/ias.png",
      "h": 78
    },
    {
      "c": "",
      "n": "Red Dialmed",
      "img": "img/clientes/red-dialmed.png",
      "h": 62
    }
  ]
};
