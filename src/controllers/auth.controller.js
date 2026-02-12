const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const register = async (req, res) => {
    try {
        const { nombre, email, password } = req.body;

        if (!nombre || !email || !password) {
            return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
        }

        // Verificar si existe
        const [existingUsers] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: 'El email ya está registrado' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar
        const [result] = await pool.query(
            'INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)',
            [nombre, email, hashedPassword]
        );

        const [newUser] = await pool.query('SELECT id, nombre, email, fecha_registro FROM usuarios WHERE id = ?', [result.insertId]);

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            usuario: newUser[0]
        });

    } catch (error) {
        console.error('Error en register:', error);
        res.status(500).json({ success: false, message: 'Error al registrar usuario' });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email y contraseña son requeridos' });
        }

        const [users] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Email o contraseña incorrectos' });
        }

        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ success: false, message: 'Email o contraseña incorrectos' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        delete user.password;

        res.json({
            success: true,
            message: 'Inicio de sesión exitoso',
            token,
            usuario: user
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, message: 'Error al iniciar sesión' });
    }
};

const getProfile = async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, nombre, email, fecha_registro FROM usuarios WHERE id = ?', [req.userId]);

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        res.json({ success: true, usuario: users[0] });
    } catch (error) {
        console.error('Error en profile:', error);
        res.status(500).json({ success: false, message: 'Error al obtener perfil' });
    }
};

module.exports = { register, login, getProfile };
