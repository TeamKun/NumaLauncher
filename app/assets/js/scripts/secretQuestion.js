const selectedUUID = ConfigManager.getSelectedAccount().uuid

const axiosBase = require('axios')
const { resolveFiles } = require('electron-updater/out/providers/Provider')
const axios = axiosBase.create({
    headers: {
        'Content-Type': 'application/json',
    },
    responseType: 'json',
})
let isSecured = false

$(window).on('load', async () => {
    isSecured = await isCurrentIPSecured()
    const questions = await fetchSecurityQuestions()
    const submitSecretQuestionContent = `
        <div id="submitSecretQuestionContent" style="display: none;">
            <div class="submitSecretQuestionContent__closeBtn__wrap">
                <div class="submitSecretQuestionContent__closeBtn closeSubmitSecretQuestion"></div>
            </div>
            <h3 class="submitSecretQuestionContent__ttl">秘密の質問の認証</h3>
            <div class="submitSecretQuestionContent__inner">
                <h4>
                    スキンを適用するためには秘密の質問を入力し,送信する必要があります.
                </h4>
                <form name="submitSecretQuestion">
                    <div class="question1 question">
                        <h4>Question 1</h4>
                        <p>${questions[0].question.question}</p>
                        <input name="answer1" type="text" data-answerid="${questions[0].answer.id}" />
                    </div>
                    <div class="question2 question">
                        <h4>Question 2</h4>
                        <p>${questions[1].question.question}</p>
                        <input name="answer2" type="text" data-answerid="${questions[1].answer.id}" />
                    </div>
                    <div class="question3 question">
                        <h4>Question 3</h4>
                        <p>${questions[2].question.question}</p>
                        <input name="answer3" type="text" data-answerid="${questions[2].answer.id}" />
                    </div>
                </form>
                <p>秘密の質問の答えがわからない場合は<a href="https://account.mojang.com/login" style="color: #00bb42;">こちら</a>からログインして再設定してください.</p>
            </div>
            <div class="submitSecretQuestion__buttonArea">
                <span class="errorMessage__403 errorMessage" style="display: none; color: red"
                    >秘密の質問の回答が間違っています.</span
                >
                <span class="errorMessage__429 errorMessage" style="display: none; color: red"
                    >送信のしすぎです.少し時間を置いてから再度送信してください.</span
                >
                <span class="errorMessage__unknown errorMessage" style="display: none; color: red"
                    >原因不明のエラーが発生しました.</span
                >
                <input type="button" class="submitSecretQuestionBtn" value="送信" />
            </div>
        </div>
        `
    $('#newsContainer').append(submitSecretQuestionContent)
    $('.submitSecretQuestionBtn').on('click', submit())
    $('#submitSecretQuestionContent .closeSubmitSecretQuestion').on(
        'click',
        () => {
            $('#submitSecretQuestionContent').fadeOut()
        }
    )
})

$('#newsButton').on(
    'click',
    (() => {
        //Skin画面に遷移する時にだけ処理を行うフラグ
        let isSkinContentViewing = true

        return async () => {
            isSkinContentViewing = !isSkinContentViewing
            if (isSkinContentViewing) return

            if (!isSecured) {
                setTimeout(() => {
                    $('#submitSecretQuestionContent').fadeIn()
                }, 300)
            }
        }
    })()
)

function submit() {
    //再送信防止用フラグ
    let isSubmitting = false

    return function () {
        if (isSubmitting) return
        isSubmitting = true
        $('#submitSecretQuestionContent .errorMessage').css('display', 'none')

        const answers = []
        for (const q of document.querySelectorAll(
            '#submitSecretQuestionContent .question'
        )) {
            const input = q.childNodes[5]
            answers.push({
                id: input.getAttribute('data-answerid'),
                answer: input.value,
            })
        }
        sendSecurityAnswers(answers)
            .then((res) => {
                $('#submitSecretQuestionContent').fadeOut()
                isSecured = true
                console.log(res)
            })
            .catch((res) => {
                const status = Number(res.toString().slice(-3))
                switch (status) {
                    case 403:
                        $(
                            '#submitSecretQuestionContent .errorMessage__403'
                        ).css('display', 'inline')
                        break
                    case 429:
                        $(
                            '#submitSecretQuestionContent .errorMessage__429'
                        ).css('display', 'inline')
                        break
                    default:
                        $(
                            '#submitSecretQuestionContent .errorMessage__unknown'
                        ).css('display', 'inline')
                        break
                }
                console.log(res)
            })
            .finally(() => {
                isSubmitting = false
            })
    }
}

async function isCurrentIPSecured() {
    const config = {
        headers: {
            Authorization:
                'Bearer ' +
                ConfigManager.getAuthAccount(selectedUUID).accessToken,
        },
    }
    return axios
        .get('https://api.mojang.com/user/security/location', config)
        .then((res) => {
            console.log(res)
            return true
        })
        .catch((res) => {
            console.log(res)
            return false
        })
}

async function fetchSecurityQuestions() {
    const config = {
        headers: {
            Authorization:
                'Bearer ' +
                ConfigManager.getAuthAccount(selectedUUID).accessToken,
        },
    }
    return axios
        .get('https://api.mojang.com/user/security/challenges', config)
        .then((res) => {
            return res.data
        })
}

async function sendSecurityAnswers(answers) {
    return axios({
        method: 'post',
        url: 'https://api.mojang.com/user/security/location',
        headers: {
            Authorization:
                'Bearer ' +
                ConfigManager.getAuthAccount(selectedUUID).accessToken,
        },
        data: [
            {
                id: answers[0].id,
                answer: answers[0].answer,
            },
            {
                id: answers[1].id,
                answer: answers[1].answer,
            },
            {
                id: answers[2].id,
                answer: answers[2].answer,
            },
        ],
    })
}
