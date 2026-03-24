const jwt = require('jsonwebtoken')

const token = jwt.sign(
  {
    sub: 1,
    email: 'admin@programandoweb.net',
    role: 'admin',
  },
  'super_secret_key_change_me',
  { expiresIn: '7d' },
)

console.log(token)