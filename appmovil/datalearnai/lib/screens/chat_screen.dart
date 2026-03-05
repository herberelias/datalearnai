import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import '../providers/chat_provider.dart';
import '../services/meili_service.dart';
import '../widgets/typing_indicator.dart';
import '../widgets/empty_state.dart';
import '../widgets/search_suggestions.dart';

class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const _ChatView();
  }
}

class _ChatView extends StatefulWidget {
  const _ChatView();

  @override
  State<_ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<_ChatView> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  final MeiliService _meiliService = MeiliService();
  List<String> _suggestions = [];
  Timer? _debounceTimer;

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chatProvider = Provider.of<ChatProvider>(context);

    // Auto scroll al enviar mensaje
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });

    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: const Text('Asistente IA'),
        actions: [
          if (chatProvider.isSpeaking)
            IconButton(
              icon: Icon(
                chatProvider.isPaused ? Icons.play_arrow : Icons.pause,
              ),
              tooltip: chatProvider.isPaused ? 'Reanudar' : 'Pausar',
              onPressed: () {
                if (chatProvider.isPaused) {
                  chatProvider.resumeSpeech();
                } else {
                  chatProvider.pauseSpeech();
                }
              },
            ),
          if (chatProvider.isSpeaking)
            IconButton(
              icon: const Icon(Icons.stop),
              tooltip: 'Detener voz',
              onPressed: () {
                chatProvider.stopSpeech();
              },
            ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Nuevo Chat',
            onPressed: () {
              chatProvider.clearChat();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: chatProvider.messages.isEmpty
                ? EmptyState(
                    icon: Icons.chat_bubble_outline,
                    title: '¡Hola! Soy tu Asistente IA',
                    subtitle:
                        'Pregúntame lo que quieras sobre tu negocio y te ayudaré a encontrar la información',
                    suggestions: const [
                      '¿Cuáles son los productos más vendidos?',
                      'Muestra las ventas de este mes',
                      '¿Qué vendedor tiene mejor desempeño?',
                      'Lista los clientes con más compras',
                    ],
                    onSuggestionTap: (suggestion) {
                      _textController.text = suggestion;
                      _sendMessage(chatProvider);
                    },
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(20),
                    itemCount:
                        chatProvider.messages.length +
                        (chatProvider.isLoading ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (chatProvider.isLoading &&
                          index == chatProvider.messages.length) {
                        return const Padding(
                          padding: EdgeInsets.only(top: 10),
                          child: TypingIndicator(),
                        );
                      }
                      final msg = chatProvider.messages[index];
                      return _MessageBubble(message: msg);
                    },
                  ),
          ),
          SearchSuggestions(
            suggestions: _suggestions,
            onTap: (sugerencia) {
              setState(() {
                _textController.text = sugerencia;
                _suggestions = [];
              });
            },
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            color: Theme.of(context).cardColor,
            child: SafeArea(
              child: Row(
                children: [
                  if (chatProvider.speechAvailable)
                    IconButton(
                      icon: Icon(
                        chatProvider.isListening ? Icons.mic : Icons.mic_none,
                        color: chatProvider.isListening
                            ? Colors.red
                            : Colors.grey,
                      ),
                      onPressed: () {
                        if (chatProvider.isListening) {
                          chatProvider.stopListening();
                        } else {
                          chatProvider.startListening((text) {
                            setState(() {
                              _textController.text = text;
                            });
                          });
                        }
                      },
                    ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      decoration: InputDecoration(
                        hintText: chatProvider.isListening
                            ? 'Escuchando...'
                            : 'Escribe tu consulta...',
                        filled: true,
                        fillColor: Theme.of(context).scaffoldBackgroundColor,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 10,
                        ),
                      ),
                      onChanged: (texto) => _onTextChanged(texto),
                      onSubmitted: (_) => _sendMessage(chatProvider),
                    ),
                  ),
                  const SizedBox(width: 10),
                  IconButton(
                    icon: const Icon(Icons.send, color: Color(0xFF6C63FF)),
                    onPressed: () => _sendMessage(chatProvider),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _sendMessage(ChatProvider provider) {
    if (_textController.text.trim().isEmpty) return;

    // Limpiar sugerencias al enviar
    setState(() {
      _suggestions = [];
    });
    _debounceTimer?.cancel();

    // Quitar foco del TextField para cerrar teclado
    FocusScope.of(context).unfocus();

    provider.sendMessage(_textController.text.trim());
    _textController.clear();

    // Scroll al final después de que el teclado se cierre
    Future.delayed(const Duration(milliseconds: 400), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _onTextChanged(String texto) {
    if (texto.length < 3) {
      setState(() => _suggestions = []);
      _debounceTimer?.cancel();
      return;
    }
    _debounceTimer?.cancel();
    _debounceTimer = Timer(
      const Duration(milliseconds: 300),
      () => _fetchSuggestions(texto),
    );
  }

  Future<void> _fetchSuggestions(String texto) async {
    final results = await _meiliService.buscarSugerencias(texto);
    if (mounted) {
      setState(() => _suggestions = results);
    }
  }
}

class _MessageBubble extends StatelessWidget {
  final Message message;

  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    final color = isUser
        ? const Color(0xFF6C63FF)
        : Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF2A2D3E)
        : Colors.grey[300]!;
    final textColor = isUser
        ? Colors.white
        : Theme.of(context).brightness == Brightness.dark
        ? Colors.white
        : Colors.black87;
    final align = isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start;
    final radius = isUser
        ? const BorderRadius.only(
            topLeft: Radius.circular(20),
            bottomLeft: Radius.circular(20),
            bottomRight: Radius.circular(20),
          )
        : const BorderRadius.only(
            topRight: Radius.circular(20),
            bottomLeft: Radius.circular(20),
            bottomRight: Radius.circular(20),
          );

    return FadeInUp(
      duration: const Duration(milliseconds: 300),
      child: Column(
        crossAxisAlignment: align,
        children: [
          Container(
            margin: const EdgeInsets.symmetric(vertical: 5),
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(color: color, borderRadius: radius),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SelectableText(
                  message.text,
                  style: TextStyle(color: textColor),
                ),
                /* // Ocultar SQL en la versión de producción
                  if (!isUser && message.sql != null) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: Text(
                      'SQL: ${message.sql}',
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 10,
                        color: Colors.greenAccent,
                      ),
                    ),
                  ),
                ], */
                if (!isUser && message.data != null) ...[
                  const SizedBox(height: 10),
                  _buildTable(message.data),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTable(dynamic data) {
    try {
      if (data is! List || data.isEmpty) return const SizedBox.shrink();

      // Filtrar solo filas que sean Map (ignora strings u otros tipos)
      final rows = data
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();

      if (rows.isEmpty) return const SizedBox.shrink();

      final headers = rows.first.keys.toList();
      if (headers.isEmpty) return const SizedBox.shrink();

      return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowHeight: 40,
          dataRowMinHeight: 30,
          columns: headers
              .map(
                (h) => DataColumn(
                  label: Text(
                    h.toString(),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
              )
              .toList(),
          rows: rows.map((row) {
            return DataRow(
              cells: headers
                  .map(
                    (h) => DataCell(
                      Text(
                        (row[h] ?? '').toString(),
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  )
                  .toList(),
            );
          }).toList(),
        ),
      );
    } catch (e) {
      // Si hay cualquier error al renderizar la tabla, no crashear la app
      return const SizedBox.shrink();
    }
  }
}
