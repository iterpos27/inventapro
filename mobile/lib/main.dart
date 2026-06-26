import 'package:flutter/material.dart';

import 'app_shell.dart';
import 'app_theme.dart';

void main() {
  runApp(const InventaProApp());
}

class InventaProApp extends StatelessWidget {
  const InventaProApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'InventaPro',
      theme: buildAppTheme(),
      home: const AppShell(),
    );
  }
}
