import 'package:flutter/material.dart';

import '../app_theme.dart';

class ApiSettingsTile extends StatelessWidget {
  const ApiSettingsTile({
    super.key,
    required this.apiBaseUrl,
    required this.onChanged,
  });

  final String apiBaseUrl;
  final Future<void> Function(String value) onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: () => showApiSettingsDialog(context, apiBaseUrl, onChanged),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xffeef6ff),
          border: Border.all(color: appBorder),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          children: [
            const Icon(Icons.dns_outlined, color: appPrimary, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Servidor API',
                    style: TextStyle(
                      color: appBlue,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    apiBaseUrl,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                ],
              ),
            ),
            const Icon(Icons.edit_outlined, color: appBlue, size: 19),
          ],
        ),
      ),
    );
  }
}

class ApiSettingsIconButton extends StatelessWidget {
  const ApiSettingsIconButton({
    super.key,
    required this.apiBaseUrl,
    required this.onChanged,
  });

  final String apiBaseUrl;
  final Future<void> Function(String value) onChanged;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Servidor API',
      onPressed: () => showApiSettingsDialog(context, apiBaseUrl, onChanged),
      icon: const Icon(Icons.dns_outlined, color: appBlue),
    );
  }
}

Future<void> showApiSettingsDialog(
  BuildContext context,
  String currentValue,
  Future<void> Function(String value) onChanged,
) async {
  final controller = TextEditingController(text: currentValue);
  final focusNode = FocusNode();
  await showDialog<void>(
    context: context,
    builder: (dialogContext) {
      String? errorText;
      return StatefulBuilder(
        builder: (stateContext, setDialogState) {
          return AlertDialog(
            title: const Text('Servidor API'),
            content: TextField(
              controller: controller,
              focusNode: focusNode,
              keyboardType: TextInputType.url,
              decoration: InputDecoration(
                labelText: 'URL',
                hintText: 'http://127.0.0.1:4000/api/v1',
                errorText: errorText,
              ),
              autofocus: true,
            ),
            actions: [
              TextButton(
                onPressed: () {
                  focusNode.unfocus();
                  Navigator.of(dialogContext).pop();
                },
                child: const Text('Cancelar'),
              ),
              FilledButton(
                onPressed: () async {
                  final value = controller.text.trim();
                  final valid =
                      value.startsWith('http://') ||
                      value.startsWith('https://');
                  if (!valid) {
                    setDialogState(() {
                      errorText =
                          'Ingrese una URL valida con http:// o https://';
                    });
                    return;
                  }
                  focusNode.unfocus();
                  await onChanged(value);
                  if (dialogContext.mounted) {
                    Navigator.of(dialogContext).pop();
                  }
                },
                child: const Text('Guardar'),
              ),
            ],
          );
        },
      );
    },
  );
  focusNode.dispose();
  controller.dispose();
}
