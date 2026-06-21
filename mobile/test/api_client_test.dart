import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/api_client.dart';
import 'package:mobile/config.dart';

void main() {
  test('la API de produccion apunta al dominio fijo de Railway', () {
    expect(
      AppConfig.defaultApiBaseUrl,
      'https://inventapro.up.railway.app/api/v1',
    );
  });

  test('dominios publicos usan https y las IP locales conservan http', () {
    final publicClient = ApiClient(
      apiBaseUrl: 'http://inventapro.up.railway.app/api/v1/',
    );
    final localClient = ApiClient(apiBaseUrl: 'http://192.168.2.5:4000/api/v1');

    expect(publicClient.apiBaseUrl, 'https://inventapro.up.railway.app/api/v1');
    expect(localClient.apiBaseUrl, 'http://192.168.2.5:4000/api/v1');
  });

  test('token invalido limpia la sesion y notifica al shell', () async {
    var unauthorizedCalled = false;
    final client = ApiClient(
      apiBaseUrl: 'https://inventapro.example/api/v1',
      httpClient: MockClient(
        (_) async => http.Response(
          '{"ok":false,"message":"Token invalido"}',
          401,
          headers: {'content-type': 'application/json'},
        ),
      ),
      onUnauthorized: () async {
        unauthorizedCalled = true;
      },
    )..token = 'token-anterior';

    await expectLater(
      client.tomas(),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 401)
            .having((error) => error.message, 'message', 'Token invalido'),
      ),
    );

    expect(client.token, isNull);
    expect(unauthorizedCalled, isTrue);
  });

  test('token ausente tambien obliga a volver al login', () async {
    var unauthorizedCalled = false;
    final client = ApiClient(
      apiBaseUrl: 'https://inventapro.example/api/v1',
      httpClient: MockClient(
        (_) async => http.Response(
          '{"ok":false,"message":"Token requerido"}',
          401,
          headers: {'content-type': 'application/json'},
        ),
      ),
      onUnauthorized: () async {
        unauthorizedCalled = true;
      },
    );

    await expectLater(
      client.tomas(),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 401)
            .having((error) => error.message, 'message', 'Token requerido'),
      ),
    );

    expect(unauthorizedCalled, isTrue);
  });

  test(
    'credenciales rechazadas muestran el error sin reiniciar el login',
    () async {
      var unauthorizedCalled = false;
      final client = ApiClient(
        apiBaseUrl: 'https://inventapro.example/api/v1',
        httpClient: MockClient(
          (_) async => http.Response(
            '{"ok":false,"message":"Usuario o contrasena incorrectos"}',
            401,
            headers: {'content-type': 'application/json'},
          ),
        ),
        onUnauthorized: () async {
          unauthorizedCalled = true;
        },
      );

      await expectLater(
        client.login('usuario', 'clave'),
        throwsA(
          isA<ApiException>()
              .having((error) => error.statusCode, 'statusCode', 401)
              .having(
                (error) => error.message,
                'message',
                'Usuario o contrasena incorrectos',
              ),
        ),
      );

      expect(unauthorizedCalled, isFalse);
    },
  );
}
