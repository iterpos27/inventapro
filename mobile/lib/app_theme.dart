import 'package:flutter/material.dart';

const appBlue = Color(0xff003f7f);
const appPrimary = Color(0xff2364a5);
const appGreen = Color(0xff168555);
const appRed = Color(0xffe63946);
const appBackground = Color(0xfff3f8ff);
const appBorder = Color(0xffb9d7f4);
const appWarning = Color(0xffd99a00);

ThemeData buildAppTheme() {
  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: appBackground,
    colorScheme: ColorScheme.fromSeed(seedColor: appPrimary),
    fontFamily: 'Arial',
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: appBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: appPrimary, width: 1.5),
      ),
    ),
  );
}
