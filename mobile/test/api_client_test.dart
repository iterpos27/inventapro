import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/api_client.dart';

void main() {
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
}
