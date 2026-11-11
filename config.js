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

  whatsapp: '5493364347460',             // Con código de país y sin espacios ni signos
  whatsappVisible: '+54 9 336 434-7460', // Cómo se muestra el número
  telefono: '+54 9 336 434-7460',
  email: 'davidanessi@gmail.com',
  direccion: '',       // Ej: 'Av. Savio 1234, San Nicolás'
  horario: '',         // Ej: 'de 8 a 17 h'

  horasRespuesta: '',  // Ej: '48'  ->  "Te respondemos en 48 horas hábiles."
  zona: '',            // Ej: 'San Nicolás, Rosario y alrededores'

  // Email que recibe los pedidos del formulario (con archivos adjuntos).
  // Si queda vacío se usa el "email" de arriba. Si no hay ningún email,
  // el formulario arma el mensaje y lo abre en WhatsApp.
  emailFormulario: ''
};
