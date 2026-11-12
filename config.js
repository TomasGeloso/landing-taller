/*
  DATOS DEL TALLER
  ----------------
  Completá cada dato entre las comillas y guardá el archivo.
  La página los toma automáticamente: nombre, contacto, links de WhatsApp y el envío del formulario.
  Lo que quede vacío se sigue viendo marcado en amarillo en la página, como recordatorio.
*/
window.TALLER = {
  nombre: 'Mecalab',                         // Nombre comercial: la marca que se ve grande
  razonSocial: 'David Annessi Mecanizados',  // Como está inscripto: se ve chico, debajo de la marca y en el pie
  ciudad: 'San Nicolás de los Arroyos',
  provincia: 'Buenos Aires',

  whatsapp: '5493364290046',             // Con código de país y sin espacios ni signos
  whatsappVisible: '+54 9 336 429-0046', // Cómo se muestra el número
  telefono: '+54 9 336 429-0046',
  email: 'tomasgeloso@yahoo.com',   // PRUEBA: cambiar por el mail de David antes de publicar
  direccion: '',       // Ej: 'Av. Savio 1234, San Nicolás'
  horario: '',         // Ej: 'de 8 a 17 h'

  horasRespuesta: '',  // Ej: '48'  ->  "Te respondemos en 48 horas hábiles."
  zona: '',            // Ej: 'San Nicolás, Rosario y alrededores'

  // Años de experiencia: la página calcula sola cuántos son y se actualizan cada año.
  anioInicio: 1996,               // Año en que David empezó en el oficio
  anioInicioLaboratorios: 2011,   // Año en que empezó a trabajar para laboratorios

  // Email que recibe los pedidos del formulario (con archivos adjuntos).
  // Si queda vacío se usa el "email" de arriba. Si no hay ningún email,
  // el formulario arma el mensaje y lo abre en WhatsApp.
  emailFormulario: ''
};
