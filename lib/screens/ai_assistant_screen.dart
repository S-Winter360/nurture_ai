import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../providers/ai_providers.dart';
import '../providers/local_model_provider.dart';
import '../services/ai/local_model_descriptor.dart';

class AiAssistantScreen extends ConsumerStatefulWidget {
  const AiAssistantScreen({super.key});

  @override
  ConsumerState<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends ConsumerState<AiAssistantScreen> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();

  void _sendMessage([String? text]) {
    final msg = text ?? _textController.text;
    if (msg.trim().isEmpty) return;

    ref.read(aiChatProvider.notifier).sendMessage(msg);
    _textController.clear();
    _focusNode.unfocus();
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent + 100, 
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final chatState = ref.watch(aiChatProvider);

    ref.listen<AiChatState>(aiChatProvider, (previous, next) {
      if (previous != null && next.messages.length > previous.messages.length) {
        _scrollToBottom();
      }
    });

    return Scaffold(
      backgroundColor: colorScheme.surface,
      appBar: AppBar(
        title: Text('Ask NurtureAI', style: TextStyle(fontWeight: FontWeight.bold, color: colorScheme.onSurface)),
        centerTitle: false,
        backgroundColor: colorScheme.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: [
          // SPRINT 8D: Dynamic Capability Indicator
          Consumer(
            builder: (context, ref, child) {
              final modelState = ref.watch(localModelManagerProvider).value;
              final hasModel = modelState != null && modelState.status == ModelStatus.valid;
              
              return Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: hasModel ? colorScheme.primaryContainer : colorScheme.surfaceContainerHighest,
                    borderRadius: AppTheme.borderRadiusPill,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        hasModel ? Icons.memory_rounded : Icons.offline_bolt_rounded, 
                        size: 12, 
                        color: hasModel ? colorScheme.primary : colorScheme.onSurfaceVariant
                      ),
                      const SizedBox(width: 4),
                      Text(
                        hasModel ? 'On-device AI available' : 'Safe offline assistant',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              fontSize: 9,
                              color: hasModel ? colorScheme.primary : colorScheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.cleaning_services_rounded),
            tooltip: 'Clear Conversation',
            onPressed: () => ref.read(aiChatProvider.notifier).clearConversation(),
            color: colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 16.0),
                itemCount: chatState.messages.length + (chatState.isLoading ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index == 0) {
                    return Column(
                      children: [
                        _buildAiHero(context),
                        _buildSuggestedChips(context),
                        const SizedBox(height: 16),
                        _buildMessageBubble(context, chatState.messages[index]),
                      ],
                    );
                  }

                  if (index == chatState.messages.length && chatState.isLoading) {
                    return _buildLoadingBubble(context);
                  }

                  return _buildMessageBubble(context, chatState.messages[index]);
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                    decoration: BoxDecoration(color: colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(10)),
                    child: Text(
                      'NurtureAI provides health information and does not replace a qualified healthcare professional.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colorScheme.onSurfaceVariant, fontSize: 10.5, height: 1.4),
                    ),
                  ),
                  const SizedBox(height: 10),
                  _buildInputBar(context),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAiHero(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14.0),
      child: Column(
        children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(color: colorScheme.primaryContainer, borderRadius: BorderRadius.circular(18)),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: Image.asset('assets/logo.png', fit: BoxFit.cover, errorBuilder: (c, e, s) => Icon(Icons.favorite_rounded, color: colorScheme.primary)),
            ),
          ),
          const SizedBox(height: 14),
          Text('How can I help you today?', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600, color: colorScheme.onSurface)),
        ],
      ),
    );
  }

  Widget _buildSuggestedChips(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final questions = ['My baby has a fever.', 'When is my next ANC visit?', 'What should I feed my child?', 'Pregnancy danger signs?'];
    return Wrap(
      spacing: 8, runSpacing: 8, alignment: WrapAlignment.center,
      children: questions.map((q) {
        return InkWell(
          onTap: () => _sendMessage(q),
          borderRadius: AppTheme.borderRadiusPill,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(color: colorScheme.surface, borderRadius: AppTheme.borderRadiusPill, border: Border.all(color: colorScheme.outline, width: 1.5)),
            child: Text(q, style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600, color: colorScheme.onSurface)),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildMessageBubble(BuildContext context, ChatMessage msg) {
    if (msg.isEmergency) {
      return _buildEmergencyBubble(context, msg.text);
    } else if (msg.isUser) {
      return _buildUserBubble(context, msg.text);
    } else {
      return _buildAiBubble(context, msg);
    }
  }

  Widget _buildUserBubble(BuildContext context, String text) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Align(
        alignment: Alignment.centerRight,
        child: Container(
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(color: colorScheme.primaryContainer, borderRadius: const BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(18), bottomRight: Radius.circular(6))),
          child: Text(text, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onPrimaryContainer, fontSize: 13, height: 1.5)),
        ),
      ),
    );
  }

  Widget _buildAiBubble(BuildContext context, ChatMessage msg) {
    final colorScheme = Theme.of(context).colorScheme;
    final isFallback = msg.isFallback;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            width: 26, height: 26,
            decoration: BoxDecoration(color: colorScheme.primary, shape: BoxShape.circle),
            child: ClipOval(child: Image.asset('assets/logo.png', fit: BoxFit.cover, errorBuilder: (c, e, s) => Icon(Icons.favorite_rounded, size: 14, color: colorScheme.onPrimary))),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  decoration: BoxDecoration(
                    color: isFallback ? colorScheme.surface : colorScheme.surfaceContainerHighest, 
                    border: isFallback ? Border.all(color: colorScheme.outline) : null,
                    borderRadius: const BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(6), bottomRight: Radius.circular(18))
                  ),
                  child: Text(msg.text, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onSurface, fontSize: 13, height: 1.5)),
                ),
                if (msg.sources.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4.0, left: 4.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: msg.sources.take(2).map((src) {
                        return Text(
                          'Source: ${src.sourceOrg} (${src.publicationYear})\n${src.documentTitle}',
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                color: colorScheme.primary.withValues(alpha: 0.8),
                                fontSize: 9.5,
                                height: 1.3,
                              ),
                        );
                      }).toList(),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingBubble(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            width: 26, height: 26,
            decoration: BoxDecoration(color: colorScheme.primary, shape: BoxShape.circle),
            child: ClipOval(child: Image.asset('assets/logo.png', fit: BoxFit.cover, errorBuilder: (c, e, s) => Icon(Icons.favorite_rounded, size: 14, color: colorScheme.onPrimary))),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(color: colorScheme.surfaceContainerHighest, borderRadius: const BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(6), bottomRight: Radius.circular(18))),
            child: SizedBox(
              width: 20, height: 10,
              child: LinearProgressIndicator(color: colorScheme.primary, borderRadius: BorderRadius.circular(4)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmergencyBubble(BuildContext context, String text) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0, left: 34.0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: colorScheme.errorContainer, borderRadius: BorderRadius.circular(20)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.error_outline_rounded, color: colorScheme.error, size: 16),
                const SizedBox(width: 6),
                Text('This may need urgent care', style: Theme.of(context).textTheme.labelMedium?.copyWith(color: colorScheme.error, fontWeight: FontWeight.w700, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 8),
            Text(text, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onErrorContainer, fontSize: 13, height: 1.5)),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => context.go('/emergency'),
              style: FilledButton.styleFrom(backgroundColor: AppTheme.emergency, foregroundColor: Colors.white, minimumSize: const Size(double.infinity, 38), padding: const EdgeInsets.symmetric(vertical: 10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              child: const Text('Go to Emergency', style: TextStyle(fontSize: 13)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputBar(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.only(left: 16, right: 6, top: 6, bottom: 6),
      decoration: BoxDecoration(color: colorScheme.surfaceContainerHighest, borderRadius: AppTheme.borderRadiusPill),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _textController,
              focusNode: _focusNode,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _sendMessage(),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onSurface, fontSize: 13.5),
              decoration: InputDecoration(
                hintText: 'Type your question...',
                hintStyle: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant, fontSize: 12.5),
                border: InputBorder.none,
                isDense: true,
              ),
            ),
          ),
          InkWell(
            onTap: () => _sendMessage(),
            borderRadius: BorderRadius.circular(20),
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: colorScheme.primary, shape: BoxShape.circle),
              child: Icon(Icons.arrow_upward_rounded, color: colorScheme.onPrimary, size: 18),
            ),
          ),
        ],
      ),
    );
  }
}