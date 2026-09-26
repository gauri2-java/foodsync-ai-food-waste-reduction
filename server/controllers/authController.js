const { getDb, saveDb } = require('../db/database');

exports.register = (req, res) => {
  const { name, email, password, role, organization } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
  }

  const db = getDb();
  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ success: false, message: 'User with this email already exists.' });
  }

  const newUser = {
    id: Date.now().toString(),
    name,
    email: email.toLowerCase(),
    password, // In real app use bcrypt
    role: role || 'Kitchen Manager',
    organization: organization || 'Institutional Kitchen'
  };

  db.users.push(newUser);
  saveDb();

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    token: `jwt_token_${newUser.id}_${Date.now()}`,
    user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, organization: newUser.organization }
  });
};

exports.login = (req, res) => {
  const { email, password } = req.body;
  const db = getDb();
  const user = db.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase() && u.password === password);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password credentials.' });
  }

  res.json({
    success: true,
    message: 'Authentication successful',
    token: `jwt_token_${user.id}_${Date.now()}`,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, organization: user.organization }
  });
};

exports.demoLogin = (req, res) => {
  const { role = 'Kitchen Manager' } = req.body;
  const db = getDb();
  const user = db.users.find(u => u.role.toLowerCase() === role.toLowerCase()) || db.users[0];

  res.json({
    success: true,
    message: `Logged in as ${user.name} (${user.role})`,
    token: `demo_jwt_token_${user.id}`,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, organization: user.organization }
  });
};

exports.getCurrentUser = (req, res) => {
  const db = getDb();
  res.json({ success: true, user: db.users[0] });
};
