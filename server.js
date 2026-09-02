require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/register', require('./routes/register'));
app.use('/api/test', require('./routes/test'));
app.use('/api/results', require('./routes/results'));

// Page routes
const page = (f) => (_, res) => res.sendFile(path.join(__dirname, 'public', f));
app.get('/',         page('index.html'));
app.get('/thankyou', page('thankyou.html'));
app.get('/tnc',      page('tnc.html'));
app.get('/test',     page('test.html'));
app.get('/results',  page('results.html'));

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`\n🎙️  English Speaking Placement Test`);
  console.log(`   Server: http://localhost:${PORT}\n`);
});
