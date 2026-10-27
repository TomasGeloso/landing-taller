/*
  DATOS DEL TALLER
  ----------------
  Completá cada dato entre las comillas y guardá el archivo.
  La página los toma automáticamente: nombre, contacto, links de WhatsApp y el envío del formulario.
  Lo que quede vacío se sigue viendo marcado en amarillo en la página, como recordatorio.
*/
window.TALLER = {
  nombre: '',          // Ej: 'Metalúrgica Pérez'
  ciudad: '',          // Ej: 'San Nicolás'
  provincia: '',       // Ej: 'Buenos Aires'

  whatsapp: '',        // Con código de país y sin espacios ni signos. Ej: '5493364123456'
  whatsappVisible: '', // Cómo se muestra el número (opcional). Ej: '336 412-3456'
  telefono: '',        // Ej: '(0336) 442-1234'
  email: '',           // Ej: 'contacto@metalurgicaperez.com.ar'
  direccion: '',       // Ej: 'Av. Savio 1234, San Nicolás'
  horario: '',         // Ej: 'de 8 a 17 h'

  horasRespuesta: '',  // Ej: '48'  ->  "Te respondemos en 48 horas hábiles."
  zona: '',            // Ej: 'San Nicolás, Rosario y alrededores'

  // Email que recibe los pedidos del formulario (con archivos adjuntos).
  // Si queda vacío se usa el "email" de arriba. Si no hay ningún email,
  // el formulario arma el mensaje y lo abre en WhatsApp.
  emailFormulario: ''
};
