import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../services/biometric_service.dart';
import '../widgets/glass_card.dart';
import 'chat_screen.dart';
// import 'analytics_screen.dart';
// import 'forecasting_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkBiometricSetup();
    });
  }

  Future<void> _checkBiometricSetup() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);

    // 1. Verificar si ya tiene credenciales guardadas (ya activado)
    if (await authProvider.hasStoredCredentials()) return;

    // 2. Verificar si el dispositivo soporta biometría
    final canCheckBiometrics = await BiometricService.checkBiometrics();
    if (!canCheckBiometrics) return;

    // 3. Verificar si el usuario ya declinó antes
    final prefs = await SharedPreferences.getInstance();
    final declined = prefs.getBool('biometric_declined') ?? false;
    if (declined) return;

    if (!mounted) return;

    // 4. Mostrar diálogo
    _showBiometricDialog(authProvider, prefs);
  }

  void _showBiometricDialog(
    AuthProvider authProvider,
    SharedPreferences prefs,
  ) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.fingerprint, color: Color(0xFF6C63FF), size: 28),
            SizedBox(width: 10),
            Text('Activar Huella'),
          ],
        ),
        content: const Text(
          '¿Quieres activar el inicio de sesión con huella digital para entrar más rápido la próxima vez?',
        ),
        actions: [
          TextButton(
            onPressed: () async {
              // Usuario declina
              await prefs.setBool('biometric_declined', true);
              if (mounted) Navigator.pop(context);
            },
            child: const Text(
              'No, gracias',
              style: TextStyle(color: Colors.grey),
            ),
          ),
          ElevatedButton(
            onPressed: () async {
              // Usuario acepta
              await authProvider.enableBiometrics();
              if (mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('¡Huella activada correctamente!'),
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text('Activar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final themeProvider = Provider.of<ThemeProvider>(context);

    // Obtener las iniciales del usuario
    final nombre = authProvider.user?['nombre'] ?? 'Usuario';
    final iniciales = nombre.isNotEmpty
        ? nombre.substring(0, 1).toUpperCase()
        : 'U';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Inicio'),
        elevation: 0,
        actions: [
          IconButton(
            icon: Icon(
              themeProvider.isDarkMode ? Icons.light_mode : Icons.dark_mode,
            ),
            onPressed: () {
              themeProvider.toggleTheme();
            },
          ),
        ],
      ),
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            UserAccountsDrawerHeader(
              decoration: BoxDecoration(color: Theme.of(context).primaryColor),
              accountName: Text(
                authProvider.user?['nombre'] ?? 'Usuario',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              accountEmail: Text(
                authProvider.user?['email'] ?? 'correo@ejemplo.com',
              ),
              currentAccountPicture: CircleAvatar(
                backgroundColor: Theme.of(context).scaffoldBackgroundColor,
                child: Text(
                  iniciales,
                  style: TextStyle(
                    fontSize: 24,
                    color: Theme.of(context).primaryColor,
                  ),
                ),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.dashboard_outlined),
              title: const Text('Inicio'),
              onTap: () {
                Navigator.pop(context); // Cerrar drawer
              },
            ),
            ListTile(
              leading: const Icon(Icons.chat_bubble_outline),
              title: const Text('Asistente IA'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ChatScreen()),
                );
              },
            ),
            /* ANALYTICS OCULTO
            ListTile(
              leading: const Icon(Icons.bar_chart),
              title: const Text('Analytics'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AnalyticsScreen()),
                );
              },
            ),
            */
            const Divider(),
            ListTile(
              leading: Icon(
                themeProvider.isDarkMode ? Icons.dark_mode : Icons.light_mode,
              ),
              title: Text(
                themeProvider.isDarkMode ? 'Modo Oscuro' : 'Modo Claro',
              ),
              trailing: Switch(
                value: themeProvider.isDarkMode,
                onChanged: (val) {
                  themeProvider.toggleTheme();
                },
              ),
            ),
            ListTile(
              leading: const Icon(Icons.logout, color: Colors.redAccent),
              title: const Text(
                'Cerrar Sesión',
                style: TextStyle(color: Colors.redAccent),
              ),
              onTap: () {
                authProvider.logout();
                // La navegación automática la maneja el AuthWrapper
              },
            ),
          ],
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FadeInRight(
              child: Text(
                'Hola, $nombre',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            const SizedBox(height: 30),
            FadeInUp(
              delay: const Duration(milliseconds: 200),
              child: _MenuCard(
                icon: Icons.chat_bubble_outline,
                title: 'Asistente IA',
                subtitle: 'Tu Consultor de Negocios Inteligente',
                color: const Color(0xFF6C63FF),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const ChatScreen()),
                  );
                },
              ),
            ),
            /* ANALYTICS CENTER OCULTO
            const SizedBox(height: 20),
            FadeInUp(
              delay: const Duration(milliseconds: 300),
              child: _MenuCard(
                icon: Icons.bar_chart_rounded,
                title: 'Analytics Center',
                subtitle: 'Gráficos y reportes',
                color: Colors.purple,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const AnalyticsScreen(),
                  ),
                ),
              ),
            ),
            */
            /* 
            const SizedBox(height: 15),
            FadeInUp(
              delay: const Duration(
                milliseconds: 400,
              ), // Adjusted delay for new card
              child: _MenuCard(
                icon: Icons.auto_awesome,
                title: 'Predicciones IA',
                subtitle: 'Proyección de ventas futura',
                color: Colors.teal,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const ForecastingScreen(),
                  ),
                ),
              ),
            ),
            */
          ],
        ),
      ),
    );
  }
}

class _MenuCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _MenuCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: GlassCard(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(15),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [color.withOpacity(0.3), color.withOpacity(0.1)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(15),
                boxShadow: [
                  BoxShadow(
                    color: color.withOpacity(0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Icon(icon, color: color, size: 30),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    subtitle,
                    style: const TextStyle(color: Colors.grey, fontSize: 14),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.arrow_forward_ios, size: 16, color: color),
            ),
          ],
        ),
      ),
    );
  }
}
