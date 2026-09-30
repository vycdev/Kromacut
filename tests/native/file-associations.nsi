; Exercise the production macros under an isolated HKCU test key, never Classes.
Unicode true
SilentInstall silent
RequestExecutionLevel user
OutFile "${TEST_OUTFILE}"
!define MAINBINARYNAME "kromacut"
!define KROMACUT_ASSOCIATIONS_ROOT "Software\Kromacut\FileAssociationTests\${TEST_ID}"
!include LogicLib.nsh
; The hook expects the two upstream macros to be defined before it replaces them.
!macro APP_ASSOCIATE EXT FILECLASS DESCRIPTION ICON COMMANDTEXT COMMAND
!macroend
!macro APP_UNASSOCIATE EXT FILECLASS
!macroend
!include "${ASSOCIATIONS_FILE}"

!macro AssertEqual ACTUAL EXPECTED
  ${If} "${ACTUAL}" != "${EXPECTED}"
    SetErrorLevel 1
    Goto cleanup
  ${EndIf}
!macroend

Section
  SetShellVarContext current
  StrCpy $INSTDIR "$TEMP\Kromacut test path with spaces"

  ; Fresh install and upgrade must retain the original handler.
  WriteRegStr HKCU "${KROMACUT_ASSOCIATIONS_ROOT}\.kfil" "" "Previous.App"
  !insertmacro APP_ASSOCIATE "kfil" "Kromacut.FilamentProfile" "Profile" "icon" "Open" "unused"
  !insertmacro APP_ASSOCIATE "kfil" "Kromacut.FilamentProfile" "Profile" "icon" "Open" "unused"
  ReadRegStr $R1 HKCU "${KROMACUT_ASSOCIATIONS_ROOT}\.kfil" "Kromacut.FilamentProfile_backup"
  !insertmacro AssertEqual "$R1" "Previous.App"
  ReadRegStr $R1 HKCU "${KROMACUT_ASSOCIATIONS_ROOT}\Kromacut.FilamentProfile\shell\open\command" ""
  !insertmacro AssertEqual "$R1" '$\"$INSTDIR\kromacut.exe$\" $\"%1$\"'
  !insertmacro APP_UNASSOCIATE "kfil" "Kromacut.FilamentProfile"
  ReadRegStr $R1 HKCU "${KROMACUT_ASSOCIATIONS_ROOT}\.kfil" ""
  !insertmacro AssertEqual "$R1" "Previous.App"

  ; Another handler selected after installation must not be replaced on removal.
  !insertmacro APP_ASSOCIATE "kapp" "Kromacut.FilamentProfile" "Profile" "icon" "Open" "unused"
  WriteRegStr HKCU "${KROMACUT_ASSOCIATIONS_ROOT}\.kapp" "" "Chosen.Later"
  !insertmacro APP_UNASSOCIATE "kapp" "Kromacut.FilamentProfile"
  ReadRegStr $R1 HKCU "${KROMACUT_ASSOCIATIONS_ROOT}\.kapp" ""
  !insertmacro AssertEqual "$R1" "Chosen.Later"

  ; A fresh extension must not retain an empty key or a dangling ProgID.
  !insertmacro APP_ASSOCIATE "kpal" "Kromacut.Palette" "Palette" "icon" "Open" "unused"
  !insertmacro APP_UNASSOCIATE "kpal" "Kromacut.Palette"
  ClearErrors
  ReadRegStr $R1 HKCU "${KROMACUT_ASSOCIATIONS_ROOT}\.kpal" ""
  ${IfNot} ${Errors}
    SetErrorLevel 1
    Goto cleanup
  ${EndIf}
  ClearErrors
  ReadRegStr $R1 HKCU "${KROMACUT_ASSOCIATIONS_ROOT}\Kromacut.Palette" ""
  ${IfNot} ${Errors}
    SetErrorLevel 1
    Goto cleanup
  ${EndIf}
  SetErrorLevel 0
cleanup:
  DeleteRegKey HKCU "${KROMACUT_ASSOCIATIONS_ROOT}"
SectionEnd
