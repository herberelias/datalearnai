import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // Colores Base Dark
  static const Color primary = Color(0xFF6C63FF);
  static const Color secondary = Color(0xFF2A2D3E);
  static const Color backgroundDark = Color(0xFF212332);
  static const Color surfaceDark = Color(0xFF2A2D3E);
  static const Color accent = Color(0xFF00E5FF);

  // Colores Base Light
  static const Color backgroundLight = Color(0xFFF4F6F8);
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color textLight = Color(0xFF212121);

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: backgroundDark,
      primaryColor: primary,
      colorScheme: const ColorScheme.dark(
        primary: primary,
        secondary: accent,
        surface: surfaceDark,
        background: backgroundDark,
        error: Color(0xFFFF5252),
      ),
      textTheme: GoogleFonts.poppinsTextTheme(ThemeData.dark().textTheme),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        iconTheme: IconThemeData(color: Colors.white),
      ),
      inputDecorationTheme: _inputDecoration(surfaceDark, Colors.white),
      elevatedButtonTheme: _buttonTheme(),
      cardColor: surfaceDark,
      textSelectionTheme: const TextSelectionThemeData(
        cursorColor: Colors.amber,
        selectionColor: Color(0xFFFFB74D), // Naranja suave
        selectionHandleColor: Colors.amber,
      ),
    );
  }

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: backgroundLight,
      primaryColor: primary,
      colorScheme: const ColorScheme.light(
        primary: primary,
        secondary: accent,
        surface: surfaceLight,
        background: backgroundLight,
        error: Color(0xFFFF5252),
      ),
      textTheme: GoogleFonts.poppinsTextTheme(ThemeData.light().textTheme),
      appBarTheme: const AppBarTheme(
        backgroundColor: backgroundLight,
        elevation: 0,
        centerTitle: true,
        iconTheme: IconThemeData(color: Colors.black87),
        titleTextStyle: TextStyle(
          color: Colors.black87,
          fontSize: 20,
          fontWeight: FontWeight.bold,
        ),
      ),
      inputDecorationTheme: _inputDecoration(surfaceLight, Colors.black87),
      elevatedButtonTheme: _buttonTheme(),
      cardColor: surfaceLight,
      textSelectionTheme: const TextSelectionThemeData(
        cursorColor: Colors.deepOrange,
        selectionColor: Color(0xFFFFCC80), // Naranja claro
        selectionHandleColor: Colors.deepOrange,
      ),
    );
  }

  static InputDecorationTheme _inputDecoration(
    Color fillColor,
    Color textColor,
  ) {
    return InputDecorationTheme(
      filled: true,
      fillColor: fillColor,
      hintStyle: TextStyle(color: textColor.withOpacity(0.5)),
      labelStyle: TextStyle(color: textColor),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(15),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(15),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(15),
        borderSide: const BorderSide(color: primary, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
    );
  }

  static ElevatedButtonThemeData _buttonTheme() {
    return ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 5,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
        padding: const EdgeInsets.symmetric(vertical: 16),
      ),
    );
  }
}
