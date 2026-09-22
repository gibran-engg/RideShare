require('dotenv').config();
const express = require('express');
const { auth } = require('express-openid-connect');

const app = express();

app.use(auth({
  issuerBaseURL: process.env.ISSUER_BASE_URL,
  baseURL: process.env.BASE_URL,
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  secret: process.env.SECRET,
  authRequired: false,
}));

app.listen(3000, () => console.log('Running on http://localhost:3000'));

app.get('/', (req, res) => {
  res.send(req.oidc.isAuthenticated() ? 'Logged in!' : 'Logged out');
});