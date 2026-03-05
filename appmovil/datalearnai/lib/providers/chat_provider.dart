import 'package:flutter/material.dart';
import '../services/chat_service.dart';

import 'package:speech_to_text/speech_to_text.dart';
import 'package:flutter_tts/flutter_tts.dart';

class ChatProvider extends ChangeNotifier {
  final ChatService _chatService = ChatService();
  final SpeechToText _speech = SpeechToText();
  final FlutterTts _flutterTts = FlutterTts();

  final List<Message> _messages = [];
  bool _isLoading = false;
  bool _isListening = false;
  bool _speechAvailable = false;
  bool _isSpeaking = false;
  bool _isPaused = false;

  List<Message> get messages => _messages;
  bool get isLoading => _isLoading;
  bool get isListening => _isListening;
  bool get speechAvailable => _speechAvailable;
  bool get isSpeaking => _isSpeaking;
  bool get isPaused => _isPaused;

  ChatProvider() {
    initSpeech();
    _initTts();
    loadHistory();
  }

  Future<void> loadHistory() async {
    _isLoading = true;
    notifyListeners();

    try {
      final result = await _chatService.getHistory();
      if (result['success']) {
        final historyList = result['history'] as List;
        _messages.clear();

        for (var item in historyList) {
          // Mensaje Usuario
          _messages.add(Message(text: item['pregunta'], isUser: true));

          // Mensaje IA
          _messages.add(Message(text: item['respuesta'], isUser: false));
        }
      }
    } catch (e) {
      print('Error cargando historial: $e');
      // No mostrar error al usuario, simplemente iniciar con historial vacío
    }

    _isLoading = false;
    notifyListeners();
  }

  void clearChat() {
    _messages.clear();
    notifyListeners();
  }

  void initSpeech() async {
    _speechAvailable = await _speech.initialize(
      onError: (val) => print('onError: $val'),
      onStatus: (val) {
        if (val == 'done' || val == 'notListening') {
          _isListening = false;
          notifyListeners();
        }
      },
    );
    notifyListeners();
  }

  void _initTts() async {
    await _flutterTts.setLanguage("es-ES");
    await _flutterTts.setPitch(1.0);

    _flutterTts.setStartHandler(() {
      _isSpeaking = true;
      _isPaused = false;
      notifyListeners();
    });

    _flutterTts.setCompletionHandler(() {
      _isSpeaking = false;
      _isPaused = false;
      notifyListeners();
    });

    _flutterTts.setCancelHandler(() {
      _isSpeaking = false;
      _isPaused = false;
      notifyListeners();
    });

    _flutterTts.setPauseHandler(() {
      _isPaused = true;
      notifyListeners();
    });

    _flutterTts.setContinueHandler(() {
      _isPaused = false;
      notifyListeners();
    });
  }

  void startListening(Function(String) onResult) async {
    if (_speechAvailable && !_isListening) {
      _isListening = true;
      notifyListeners();
      _speech.listen(
        onResult: (val) {
          onResult(val.recognizedWords);
        },
        localeId: "es-ES",
      );
    }
  }

  void stopListening() async {
    if (_isListening) {
      await _speech.stop();
      _isListening = false;
      notifyListeners();
    }
  }

  Future<void> speak(String text) async {
    if (text.isNotEmpty) {
      await _flutterTts.speak(text);
    }
  }

  Future<void> pauseSpeech() async {
    if (_isSpeaking && !_isPaused) {
      await _flutterTts.pause();
    }
  }

  Future<void> resumeSpeech() async {
    if (_isSpeaking && _isPaused) {
      // En Android/iOS, usar stop y volver a hablar no es ideal
      // Pero FlutterTts no siempre soporta resume
      await _flutterTts.speak(""); // Intento de continuar
    }
  }

  Future<void> stopSpeech() async {
    if (_isSpeaking) {
      await _flutterTts.stop();
      _isSpeaking = false;
      _isPaused = false;
      notifyListeners();
    }
  }

  Future<void> sendMessage(String text) async {
    if (text.isEmpty) return;

    // Agregar mensaje usuario
    _messages.add(Message(text: text, isUser: true));
    _isLoading = true;
    notifyListeners();

    try {
      // Construir historial de contexto (últimos 5 pares de interacción)
      List<Map<String, String>> history = [];
      for (int i = 0; i < _messages.length - 1; i++) {
        if (_messages[i].isUser &&
            (i + 1 < _messages.length) &&
            !_messages[i + 1].isUser) {
          history.add({
            'pregunta': _messages[i].text,
            'respuesta': _messages[i + 1].text,
          });
        }
      }
      if (history.length > 5) {
        history = history.sublist(history.length - 5);
      }

      // Llamar API con historial
      final result = await _chatService.sendMessage(text, history: history);

      _isLoading = false;

      if (result['success']) {
        String reply = '';

        // Convertir results a List de forma segura sin importar el formato del backend
        List? resultsList;
        final rawResults = result['results'];
        if (rawResults is List) {
          resultsList = rawResults;
        } else if (rawResults is Map) {
          resultsList = rawResults.values.toList();
        }

        if (resultsList != null && resultsList.isNotEmpty) {
          reply = "🔍 He encontrado ${resultsList.length} resultados:\n\n";
          reply += "💡 ${result['explanation']}\n";
        } else {
          reply =
              "✅ Consulta ejecutada correctamente, pero no hay resultados.\n\n";
          reply += "💡 ${result['explanation'] ?? ''}";
        }

        // Speak explanation
        speak(result['explanation'] ?? '');

        _messages.add(
          Message(
            text: reply,
            isUser: false,
            sql: result['sql'],
            data: resultsList,
          ),
        );
      } else {
        final errorMsg = "❌ Error: ${result['message']}";
        speak("Lo siento, hubo un error: ${result['message']}");
        _messages.add(Message(text: errorMsg, isUser: false));
      }
    } catch (e) {
      _isLoading = false;
      String errorMsg = "❌ Error de conexión: $e";
      speak("Lo siento, hubo un error de conexión");
      _messages.add(Message(text: errorMsg, isUser: false));
      print('Error en sendMessage: $e');
    }

    notifyListeners();
  }
}

class Message {
  final String text;
  final bool isUser;
  final String? sql;
  final dynamic data;

  Message({required this.text, required this.isUser, this.sql, this.data});
}
