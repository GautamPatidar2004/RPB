require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`[Railway Block Planning Backend] Server running on port ${PORT}`);
    console.log(`[Demo Auth] Ready at http://localhost:${PORT}/api/auth`);
});

module.exports = server;
