import { auth } from "../lib/auth"
import {fromNodeHeaders} from "better-auth/node"



export const Authenticate = async (req, res, next) => {
    try {
        const {session} = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        })

        if (!session || !session?.user)  {
            return res.status(401).json({message:"Unautherize User "})
        }

        req.userId = session.user.id;
        next()
    } catch (error) {
        return res.status(401).json({message:"Authentication error : " + error.code || error.message})
    }
}