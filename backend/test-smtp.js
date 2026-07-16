const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'sharekcompany98@gmail.com',
    pass: 'yptx jbff lsce ciqk', // raw string
  },
});

transporter.verify(function (error, success) {
  if (error) {
    console.log("Error directly using raw password:", error);
  } else {
    console.log("Server is ready to take our messages with raw password");
  }
});

const transporter2 = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'sharekcompany98@gmail.com',
    pass: "'yptx jbff lsce ciqk'", // string with quotes
  },
});

transporter2.verify(function (error, success) {
  if (error) {
    console.log("Error directly using string with quotes:", error);
  } else {
    console.log("Server is ready to take our messages with quotes");
  }
});
