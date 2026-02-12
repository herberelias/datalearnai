import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import '../providers/auth_provider.dart';

import '../services/biometric_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _biometricService = BiometricService();
  bool _canCheckBiometrics = false;

  @override
  void initState() {
    super.initState();
    _checkBiometrics();
  }

  Future<void> _checkBiometrics() async {
    // Verificar si hay hardware y si hay credenciales guardadas
    final isAvailable = await _biometricService.isBiometricAvailable();
    if (!isAvailable) return;

    // Necesitamos el provider, pero initState no tiene context listo para Provider.of
    // Usamos addPostFrameCallback
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final hasCredentials = await authProvider.hasStoredCredentials();

      setState(() {
        _canCheckBiometrics = isAvailable && hasCredentials;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);

    // Navegar si está autenticado
    // La navegación ahora es manejada por AuthWrapper en main.dart

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              FadeInDown(
                duration: const Duration(milliseconds: 800),
                child: const Icon(
                  Icons.rocket_launch,
                  size: 80,
                  color: Color(0xFF6C63FF),
                ),
              ),
              const SizedBox(height: 20),
              FadeInDown(
                delay: const Duration(milliseconds: 200),
                child: Text(
                  'Bienvenido',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(height: 40),

              if (authProvider.errorMessage != null)
                FadeIn(
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 20),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.red),
                    ),
                    child: Text(
                      authProvider.errorMessage!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                ),

              FadeInUp(
                delay: const Duration(milliseconds: 400),
                child: TextField(
                  controller: _emailController,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    prefixIcon: Icon(Icons.email),
                  ),
                  keyboardType: TextInputType.emailAddress,
                ),
              ),
              const SizedBox(height: 20),
              FadeInUp(
                delay: const Duration(milliseconds: 600),
                child: TextField(
                  controller: _passwordController,
                  decoration: const InputDecoration(
                    labelText: 'Contraseña',
                    prefixIcon: Icon(Icons.lock),
                  ),
                  obscureText: true,
                ),
              ),
              const SizedBox(height: 40),
              FadeInUp(
                delay: const Duration(milliseconds: 800),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: authProvider.status == AuthStatus.checking
                        ? null
                        : () {
                            authProvider.login(
                              _emailController.text,
                              _passwordController.text,
                            );
                          },
                    child: authProvider.status == AuthStatus.checking
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text(
                            'INGRESAR',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                  ),
                ),
              ),
              if (_canCheckBiometrics) ...[
                const SizedBox(height: 20),
                FadeInUp(
                  delay: const Duration(milliseconds: 1000),
                  child: IconButton(
                    icon: const Icon(
                      Icons.fingerprint,
                      size: 50,
                      color: Color(0xFF6C63FF),
                    ),
                    onPressed: _handleBiometricLogin,
                    tooltip: 'Ingresar con Biometría',
                  ),
                ),
                const Text(
                  'Toque para ingresar',
                  style: TextStyle(color: Colors.grey),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleBiometricLogin() async {
    try {
      final authenticated = await _biometricService.authenticate();

      if (authenticated && mounted) {
        // Mostrar indicador de carga
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Autenticando...'),
            duration: Duration(seconds: 1),
          ),
        );

        final authProvider = Provider.of<AuthProvider>(context, listen: false);
        final success = await authProvider.loginWithStoredCredentials();

        if (!success && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Error: Credenciales inválidas'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } else if (!authenticated && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Autenticación biométrica cancelada'),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }
}
