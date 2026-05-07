import type { Message as MessageType } from '../hooks/useChat';

interface Props {
  message: MessageType;
}

export function Message({ message }: Props) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 whitespace-pre-wrap break-words text-sm shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 mb-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
        CS
      </div>
      <div className="max-w-[75%] bg-white border border-gray-200 shadow-sm rounded-2xl rounded-tl-sm px-4 py-2.5 whitespace-pre-wrap break-words text-sm text-gray-800">
        {message.text === '' ? (
          <span className="flex gap-1 items-center h-5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
          </span>
        ) : (
          message.text
        )}
      </div>
    </div>
  );
}
