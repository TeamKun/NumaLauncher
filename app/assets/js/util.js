/**
      * サーバー名からオーダー番号取り除く
      * */
function removeOrderNumber(serverName) {
    let reg = /^%*%/
    if (!reg.test(serverName)) {
        return serverName
    }

    return serverName.split('%')[2]
}
