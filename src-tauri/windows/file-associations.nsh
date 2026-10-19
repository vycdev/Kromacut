; Tauri includes FileAssociation.nsh before this hook file. Retain its
; registration calls while preserving the original choice across reinstalls,
; quoting executable/document paths, and respecting later changes on removal.
!include LogicLib.nsh
!ifndef KROMACUT_ASSOCIATIONS_ROOT
  !define KROMACUT_ASSOCIATIONS_ROOT "Software\Classes"
!endif

!macroundef APP_ASSOCIATE
!macro APP_ASSOCIATE EXT FILECLASS DESCRIPTION ICON COMMANDTEXT COMMAND
  ReadRegStr $R0 SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\.${EXT}" ""
  ${If} $R0 != "${FILECLASS}"
    WriteRegStr SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\.${EXT}" "${FILECLASS}_backup" "$R0"
  ${EndIf}
  WriteRegStr SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\.${EXT}" "" "${FILECLASS}"
  WriteRegStr SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\${FILECLASS}" "" `${DESCRIPTION}`
  WriteRegStr SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\${FILECLASS}\DefaultIcon" "" `${ICON}`
  WriteRegStr SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\${FILECLASS}\shell" "" "open"
  WriteRegStr SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\${FILECLASS}\shell\open" "" `${COMMANDTEXT}`
  WriteRegStr SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\${FILECLASS}\shell\open\command" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\"'
!macroend

!macroundef APP_UNASSOCIATE
!macro APP_UNASSOCIATE EXT FILECLASS
  ReadRegStr $R0 SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\.${EXT}" ""
  ${If} $R0 == "${FILECLASS}"
    ReadRegStr $R0 SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\.${EXT}" "${FILECLASS}_backup"
    ${If} $R0 == ""
      DeleteRegValue SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\.${EXT}" ""
    ${Else}
      WriteRegStr SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\.${EXT}" "" "$R0"
    ${EndIf}
  ${EndIf}
  DeleteRegValue SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\.${EXT}" "${FILECLASS}_backup"
  DeleteRegKey /ifempty SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\.${EXT}"
  DeleteRegKey SHCTX "${KROMACUT_ASSOCIATIONS_ROOT}\${FILECLASS}"
!macroend
