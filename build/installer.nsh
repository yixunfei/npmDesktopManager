!macro customInstall
  CreateDirectory "$INSTDIR\resources"

  ${If} $LANGUAGE == 2052
    FileOpen $0 "$INSTDIR\resources\default-language.json" w
    FileWrite $0 '{"language":"zh-CN","source":"installer"}'
    FileClose $0
  ${Else}
    FileOpen $0 "$INSTDIR\resources\default-language.json" w
    FileWrite $0 '{"language":"en-US","source":"installer"}'
    FileClose $0
  ${EndIf}
!macroend
