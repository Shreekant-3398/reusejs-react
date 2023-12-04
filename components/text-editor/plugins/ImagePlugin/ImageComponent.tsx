import React, {
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type {
	GridSelection,
	LexicalCommand,
	LexicalEditor,
	NodeKey,
	NodeSelection,
	RangeSelection,
} from "lexical";
import {
	$getNodeByKey,
	$getSelection,
	$isNodeSelection,
	$isRangeSelection,
	$setSelection,
	CLICK_COMMAND,
	COMMAND_PRIORITY_LOW,
	createCommand,
	KEY_BACKSPACE_COMMAND,
	KEY_DELETE_COMMAND,
	KEY_ENTER_COMMAND,
	KEY_ESCAPE_COMMAND,
	SELECTION_CHANGE_COMMAND,
} from "lexical";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalNestedComposer } from "@lexical/react/LexicalNestedComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { mergeRegister } from "@lexical/utils";

import { $isImageNode } from "./ImageNode";
import ImageResizer from "./ImageResizer";

const imageCache = new Set();

export const RIGHT_CLICK_IMAGE_COMMAND: LexicalCommand<MouseEvent> =
	createCommand("RIGHT_CLICK_IMAGE_COMMAND");

function useSuspenseImage(src: string) {
	if (!imageCache.has(src)) {
		throw new Promise((resolve) => {
			const img = new Image();
			img.src = src;
			img.onload = () => {
				imageCache.add(src);
				resolve(null);
			};
		});
	}
}

function LazyImage({
	altText,
	className,
	imageRef,
	src,
	width,
	height,
	maxWidth,
}: {
	altText: string;
	className: string | null;
	height: "inherit" | number;
	imageRef: { current: null | HTMLImageElement };
	maxWidth: number;
	src: string;
	width: "inherit" | number;
}): JSX.Element {
	useSuspenseImage(src);
	return (
		<img
			className={className || undefined}
			src={src}
			alt={altText}
			ref={imageRef}
			style={{
				height,
				maxWidth,
				width,
			}}
			draggable="false"
		/>
	);
}

export default function ImageComponent({
	src,
	altText,
	nodeKey,
	width,
	height,
	maxWidth,
	resizable,
	showCaption,
	caption,
	captionsEnabled,
}: {
	altText: string;
	caption: LexicalEditor;
	height: "inherit" | number;
	maxWidth: number;
	nodeKey: NodeKey;
	resizable: boolean;
	showCaption: boolean;
	src: string;
	width: "inherit" | number;
	captionsEnabled: boolean;
}): JSX.Element {
	const [editor] = useLexicalComposerContext();
	const imageRef = useRef<null | HTMLImageElement>(null);
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const [isSelected, setSelected, clearSelection] =
		useLexicalNodeSelection(nodeKey);
	const [isResizing, setIsResizing] = useState<boolean>(false);
	const [selection, setSelection] = useState<
		RangeSelection | NodeSelection | GridSelection | null
	>(null);
	const activeEditorRef = useRef<LexicalEditor | null>(null);

	const onDelete = useCallback(
		(payload: KeyboardEvent) => {
			if (isSelected && $isNodeSelection($getSelection())) {
				const event: KeyboardEvent = payload;
				event.preventDefault();
				const node = $getNodeByKey(nodeKey);
				if ($isImageNode(node)) {
					node.remove();
				}
			}
			return false;
		},
		[isSelected, nodeKey],
	);

	const onEnter = useCallback(
		(event: KeyboardEvent) => {
			const latestSelection = $getSelection();
			const buttonElem = buttonRef.current;
			if (
				isSelected &&
				$isNodeSelection(latestSelection) &&
				latestSelection.getNodes().length === 1
			) {
				if (showCaption) {
					// Move focus into nested editor
					$setSelection(null);
					event.preventDefault();
					caption.focus();
					return true;
				} else if (
					buttonElem !== null &&
					buttonElem !== document.activeElement
				) {
					event.preventDefault();
					buttonElem.focus();
					return true;
				}
			}
			return false;
		},
		[caption, isSelected, showCaption],
	);

	const onEscape = useCallback(
		(event: KeyboardEvent) => {
			if (
				activeEditorRef.current === caption ||
				buttonRef.current === event.target
			) {
				$setSelection(null);
				editor.update(() => {
					setSelected(true);
					const parentRootElement = editor.getRootElement();
					if (parentRootElement !== null) {
						parentRootElement.focus();
					}
				});
				return true;
			}
			return false;
		},
		[caption, editor, setSelected],
	);

	const onClick = useCallback(
		(payload: MouseEvent) => {
			const event = payload;

			if (isResizing) {
				return true;
			}
			if (event.target === imageRef.current) {
				if (event.shiftKey) {
					setSelected(!isSelected);
				} else {
					clearSelection();
					setSelected(true);
				}
				return true;
			}

			return false;
		},
		[isResizing, isSelected, setSelected, clearSelection],
	);

	const onRightClick = useCallback(
		(event: MouseEvent): void => {
			editor.getEditorState().read(() => {
				const latestSelection = $getSelection();
				const domElement = event.target as HTMLElement;
				if (
					domElement.tagName === "IMG" &&
					$isRangeSelection(latestSelection) &&
					latestSelection.getNodes().length === 1
				) {
					editor.dispatchCommand(
						RIGHT_CLICK_IMAGE_COMMAND,
						event as MouseEvent,
					);
				}
			});
		},
		[editor],
	);

	useEffect(() => {
		let isMounted = true;
		const rootElement = editor.getRootElement();
		const unregister = mergeRegister(
			editor.registerUpdateListener(({ editorState }) => {
				if (isMounted) {
					setSelection(editorState.read(() => $getSelection()));
				}
			}),
			editor.registerCommand(
				SELECTION_CHANGE_COMMAND,
				(_, activeEditor) => {
					activeEditorRef.current = activeEditor;
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand<MouseEvent>(
				CLICK_COMMAND,
				onClick,
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand<MouseEvent>(
				RIGHT_CLICK_IMAGE_COMMAND,
				onClick,
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand(
				KEY_DELETE_COMMAND,
				onDelete,
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand(
				KEY_BACKSPACE_COMMAND,
				onDelete,
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand(KEY_ENTER_COMMAND, onEnter, COMMAND_PRIORITY_LOW),
			editor.registerCommand(
				KEY_ESCAPE_COMMAND,
				onEscape,
				COMMAND_PRIORITY_LOW,
			),
		);

		rootElement?.addEventListener("contextmenu", onRightClick);

		return () => {
			isMounted = false;
			unregister();
			rootElement?.removeEventListener("contextmenu", onRightClick);
		};
	}, [
		clearSelection,
		editor,
		isResizing,
		isSelected,
		nodeKey,
		onDelete,
		onEnter,
		onEscape,
		onClick,
		onRightClick,
		setSelected,
	]);

	const setShowCaption = () => {
		editor.update(() => {
			const node = $getNodeByKey(nodeKey);
			if ($isImageNode(node)) {
				node.setShowCaption(true);
			}
		});
	};

	const onResizeEnd = (
		nextWidth: "inherit" | number,
		nextHeight: "inherit" | number,
	) => {
		// Delay hiding the resize bars for click case
		setTimeout(() => {
			setIsResizing(false);
		}, 200);

		editor.update(() => {
			const node = $getNodeByKey(nodeKey);
			if ($isImageNode(node)) {
				node.setWidthAndHeight(nextWidth, nextHeight);
			}
		});
	};

	const onResizeStart = () => {
		setIsResizing(true);
	};

	const draggable = isSelected && $isNodeSelection(selection) && !isResizing;
	const isFocused = isSelected || isResizing;
	return (
		<Suspense fallback={null}>
			<>
				<div draggable={draggable} className="not-prose">
					<LazyImage
						className={
							isFocused
								? `focused ${$isNodeSelection(selection) ? "draggable" : ""}`
								: null
						}
						src={src}
						altText={altText}
						imageRef={imageRef}
						width={width}
						height={height}
						maxWidth={maxWidth}
					/>
				</div>
				{showCaption && (
					<div className="image-caption-container">
						<LexicalNestedComposer initialEditor={caption}>
							<AutoFocusPlugin />
							<HistoryPlugin />
							{/* <MentionsPlugin /> */}
							<RichTextPlugin
								contentEditable={
									<ContentEditable className="ImageNode__contentEditable" />
								}
								placeholder={
									<span className="ImageNode__placeholder">
										Enter a caption...
									</span>
								}
								ErrorBoundary={LexicalErrorBoundary}
							/>
						</LexicalNestedComposer>
					</div>
				)}
				{resizable && $isNodeSelection(selection) && isFocused && (
					<ImageResizer
						showCaption={showCaption}
						setShowCaption={setShowCaption}
						editor={editor}
						buttonRef={buttonRef}
						imageRef={imageRef}
						maxWidth={maxWidth}
						onResizeStart={onResizeStart}
						onResizeEnd={onResizeEnd}
						captionsEnabled={captionsEnabled}
					/>
				)}
			</>
		</Suspense>
	);
}
